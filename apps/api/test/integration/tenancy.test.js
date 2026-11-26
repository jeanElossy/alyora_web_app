import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { PLATFORM_COLLECTIONS } from '../../src/lib/tenancy/platform-collections.js';
import { tenantKeysOf } from '../../src/lib/tenancy/tenant-scope.plugin.js';
import { buildProbeApp, createProbeNote } from '../fixtures/probe-resource.js';
import { useAccessDatabase } from '../helpers/access.js';
import {
  expectCheckinAgentDeniedFinancial,
  expectHiddenFromOtherTenants,
  expectReaderCannotWrite,
} from '../helpers/tenancy-assertions.js';
import { describeTenantResource, describeTenantScopedModel } from '../helpers/tenancy-suites.js';

useAccessDatabase();

// Tous les modèles de src/, trouvés sur le disque : un modèle ajouté par un lot suivant est
// classé ici sans que personne ait à l'importer.
const SRC = fileURLToPath(new URL('../../src', import.meta.url));
const modelFiles = (await readdir(SRC, { recursive: true }))
  .filter((file) => file.endsWith('.model.js'))
  .sort();
for (const file of modelFiles) {
  await import(pathToFileURL(join(SRC, file)).href);
}
const models = mongoose.modelNames().map((name) => mongoose.model(name));

describe('model classification', () => {
  it('finds the models of src/', () => {
    expect(modelFiles.length).toBeGreaterThanOrEqual(12);
    // Plus ProbeNote, la ressource de démonstration des tests (cloisonnée elle aussi).
    expect(models.length).toBeGreaterThan(modelFiles.length);
  });

  it('makes every collection either tenant scoped or a declared platform collection, never both', () => {
    const misclassified = models
      .map((model) => ({
        collection: model.collection.collectionName,
        scoped: tenantKeysOf(model.schema) !== undefined,
        platform: Object.hasOwn(PLATFORM_COLLECTIONS, model.collection.collectionName),
      }))
      .filter(({ scoped, platform }) => scoped === platform);

    expect(misclassified).toEqual([]);
  });

  it('declares no platform collection without a model', () => {
    const collections = new Set(models.map((model) => model.collection.collectionName));

    expect(Object.keys(PLATFORM_COLLECTIONS).filter((name) => !collections.has(name))).toEqual([]);
  });
});

describe('every tenant scoped model', () => {
  for (const model of models.filter((candidate) => tenantKeysOf(candidate.schema))) {
    describeTenantScopedModel(model);
  }
});

const probe = buildProbeApp();
const notePath = /** @param {{ eventId: string, resourceId: string }} ids */ ({
  eventId,
  resourceId,
}) => `/events/${eventId}/probe-notes/${resourceId}`;

/** @type {import('../helpers/tenancy-assertions.js').TenantResourceSpec} */
const probeNotes = {
  name: 'probe notes',
  app: () => probe.app,
  create: createProbeNote,
  read: { method: 'get', path: notePath },
  list: {
    route: { method: 'get', path: ({ eventId }) => `/events/${eventId}/probe-notes` },
    ids: (body) => body.map((/** @type {{ id: string }} */ note) => note.id),
  },
  writes: [
    {
      method: 'post',
      path: ({ eventId }) => `/events/${eventId}/probe-notes`,
      body: { text: 'Nouvelle' },
    },
    { method: 'patch', path: notePath, body: { text: 'Modifiée' } },
  ],
  financial: [
    { method: 'get', path: ({ eventId }) => `/events/${eventId}/probe-ledger` },
    { method: 'post', path: ({ eventId }) => `/events/${eventId}/probe-payouts` },
  ],
};

describeTenantResource(probeNotes);

describe('the access tests detect a faulty resource (negative controls)', () => {
  it('fails when the event access is not checked', async () => {
    await expect(
      expectHiddenFromOtherTenants({
        ...probeNotes,
        name: 'leaky notes',
        read: {
          method: 'get',
          path: ({ eventId, resourceId }) => `/events/${eventId}/leaky-notes/${resourceId}`,
        },
        list: undefined,
      }),
    ).rejects.toThrow(/leaky notes: a resource of B read through event B/);
  });

  it('fails when another tenant gets 403, which confirms the event exists', async () => {
    await expect(
      expectHiddenFromOtherTenants({
        ...probeNotes,
        name: 'forbidding notes',
        read: {
          method: 'get',
          path: ({ eventId, resourceId }) => `/events/${eventId}/forbidding-notes/${resourceId}`,
        },
        list: undefined,
      }),
    ).rejects.toThrow(/forbidding notes: a resource of B read through event B/);
  });

  it('fails when a reader can write', async () => {
    await expect(
      expectReaderCannotWrite({
        ...probeNotes,
        name: 'leaky writes',
        writes: [
          {
            method: 'post',
            path: ({ eventId }) => `/events/${eventId}/leaky-notes`,
            body: { text: 'x' },
          },
        ],
      }),
    ).rejects.toThrow(/leaky writes: POST .* as reader/);
  });

  it('fails when a check-in agent reads financial data', async () => {
    await expect(
      expectCheckinAgentDeniedFinancial({
        ...probeNotes,
        name: 'leaky ledger',
        financial: [{ method: 'get', path: ({ eventId }) => `/events/${eventId}/leaky-ledger` }],
      }),
    ).rejects.toThrow(/leaky ledger: GET .* as checkin_agent/);
  });

  it('fails when there is no route to check', async () => {
    await expect(expectReaderCannotWrite({ ...probeNotes, writes: [] })).rejects.toThrow(
      /routes to check/,
    );
  });
});

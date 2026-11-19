import { describe, expect, it } from 'vitest';
import { designSystemDemoFormSchema } from './demo.schema.js';

const valid = {
  fullName: 'Awa Koné',
  email: 'awa@exemple.ci',
  attendance: 'yes',
  guests: '2',
  menu: 'fish',
  consent: true,
};

describe('designSystemDemoFormSchema', () => {
  it('accepts a complete answer, converting the number of guests', () => {
    expect(designSystemDemoFormSchema.parse(valid)).toMatchObject({ guests: 2 });
  });

  it('requires the consent to be checked', () => {
    expect(designSystemDemoFormSchema.safeParse({ ...valid, consent: false }).success).toBe(false);
  });

  it('bounds the number of guests', () => {
    expect(designSystemDemoFormSchema.safeParse({ ...valid, guests: '0' }).success).toBe(false);
    expect(designSystemDemoFormSchema.safeParse({ ...valid, guests: '11' }).success).toBe(false);
  });
});

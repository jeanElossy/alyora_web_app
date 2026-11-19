import { expect, test } from '@playwright/test';

/** Une clé de traduction, telle que la langue des clés l'affiche, ou une couleur (#173D32). */
const KEY_OR_COLOR = /^([A-Za-z0-9_.:-]+|#[0-9A-F]{6})$/;

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ status: number, body: unknown }} [response]
 */
async function openDesignSystem(page, response = { status: 200, body: { status: 'ok' } }) {
  await page.route('**/api/v1/ping', (route) =>
    route.fulfill({
      status: response.status,
      contentType: 'application/json',
      body: JSON.stringify(response.body),
    }),
  );
  await page.goto('/design-system');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Les composants d’ALYORA' }),
  ).toBeVisible();
}

test('shows the 19 components at 360 px, without horizontal scroll', async ({ page }) => {
  await openDesignSystem(page);

  const components = {
    Button: page.getByRole('button', { name: 'Confirmer', exact: true }),
    Input: page.getByRole('textbox', { name: /Nom complet/ }).first(),
    Select: page.getByRole('combobox', { name: 'Menu' }).first(),
    Textarea: page.getByRole('textbox', { name: 'Message aux mariés' }).first(),
    Checkbox: page.getByRole('checkbox', { name: 'Recevoir les rappels avant le mariage' }),
    Radio: page.getByRole('radiogroup', { name: 'Serez-vous présent ?' }).first(),
    Modal: page.getByRole('button', { name: 'Ouvrir la fenêtre' }),
    Drawer: page.getByRole('button', { name: 'Ouvrir le panneau' }),
    Toast: page.getByRole('button', { name: 'Afficher une confirmation' }),
    Card: page.getByRole('heading', { name: 'Mariage d’Awa et Yao' }),
    Badge: page.getByText('Invité d’honneur'),
    Table: page.getByRole('region', { name: 'Réponses des invités' }),
    Tabs: page.getByRole('tablist', { name: 'Organisation du mariage' }),
    Tooltip: page.getByRole('button', { name: 'Qu’est-ce qu’un RSVP ?' }),
    Avatar: page.getByRole('img', { name: 'Yao Kouassi' }).first(),
    Spinner: page.getByRole('status').filter({ hasText: 'Chargement des invités…' }),
    EmptyState: page.getByRole('heading', { name: 'Aucun invité pour l’instant' }),
    Pagination: page.getByRole('navigation', { name: 'Pagination' }),
    Skeleton: page.locator('[aria-hidden="true"].animate-pulse').first(),
  };
  for (const [name, locator] of Object.entries(components)) {
    await locator.scrollIntoViewIfNeeded();
    await expect(locator, name).toBeVisible();
  }

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('can be crossed with the keyboard alone, every stop showing a visible focus', async ({
  page,
}) => {
  await openDesignSystem(page);

  /** @type {Array<{ name: string, role: string, visible: boolean }>} */
  const stops = [];
  for (let index = 0; index < 150; index += 1) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => {
      const element = document.activeElement;
      if (!element || element === document.body) {
        return null;
      }
      const style = getComputedStyle(element);
      return {
        name: (element.getAttribute('aria-label') ?? element.textContent ?? '').trim().slice(0, 40),
        role: element.getAttribute('role') ?? element.tagName.toLowerCase(),
        visible: style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0,
      };
    });
    if (!stop) {
      break;
    }
    stops.push(stop);
  }

  expect(stops.length).toBeGreaterThan(40);
  expect(stops.filter((stop) => !stop.visible)).toEqual([]);
  const roles = new Set(stops.map((stop) => stop.role));
  for (const role of [
    'button',
    'a',
    'input',
    'textarea',
    'combobox',
    'checkbox',
    'radio',
    'tab',
    'region',
  ]) {
    expect(roles, role).toContain(role);
  }
});

for (const [opener, name] of [
  ['Ouvrir la fenêtre', 'Confirmer votre présence'],
  ['Ouvrir le panneau', 'Détails de l’invité'],
]) {
  test(`"${opener}" opens a dialog that traps the focus and gives it back on Escape`, async ({
    page,
  }) => {
    await openDesignSystem(page);
    const trigger = page.getByRole('button', { name: opener });

    await trigger.focus();
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog', { name });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(':focus')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });
}

test('selects an option, switches tabs and shows a tooltip from the keyboard', async ({ page }) => {
  await openDesignSystem(page);

  const select = page.getByRole('combobox', { name: 'Menu' }).first();
  await select.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('option', { name: 'Menu végétarien' }).press('Enter');
  await expect(select).toContainText('Menu végétarien');

  await page.getByRole('tab', { name: 'Invités' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Plan de table' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('tabpanel')).toContainText('disposition des tables');

  // L'infobulle s'ouvre sur un focus clavier, et se ferme si la page défile (Radix) : le bouton
  // est d'abord placé à l'écran, puis atteint par Tab depuis l'élément précédent, sans défilement.
  const tooltipTrigger = page.getByRole('button', { name: 'Qu’est-ce qu’un RSVP ?' });
  await tooltipTrigger.scrollIntoViewIfNeeded();
  await page
    .getByRole('link', { name: 'Lien présenté en bouton' })
    .evaluate((link) => link.focus({ preventScroll: true }));
  await page.keyboard.press('Tab');
  await expect(tooltipTrigger).toBeFocused();
  await expect(page.getByRole('tooltip')).toContainText('La réponse d’un invité');
});

test('shows a notification', async ({ page }) => {
  await openDesignSystem(page);

  await page.getByRole('button', { name: 'Afficher une confirmation' }).click();

  // Radix double le texte dans une annonce pour les lecteurs d'écran : on vise la notification.
  await expect(page.getByRole('listitem').filter({ hasText: 'Invitation envoyée' })).toBeVisible();
});

test.describe('form', () => {
  /** @param {import('@playwright/test').Page} page */
  const form = (page) => page.getByRole('form', { name: 'Formulaire de démonstration' });

  /** @param {import('@playwright/test').Page} page */
  async function fillValidAnswer(page) {
    const demo = form(page);
    await demo.getByRole('textbox', { name: /Nom complet/ }).fill('Awa Koné');
    await demo.getByRole('textbox', { name: /Adresse e-mail/ }).fill('awa@exemple.ci');
    await demo.getByRole('radio', { name: 'Oui, avec plaisir' }).click();
    await demo.getByRole('spinbutton', { name: /Nombre de personnes/ }).fill('2');
    await demo.getByRole('combobox', { name: /Menu/ }).click();
    await page.getByRole('option', { name: 'Poisson braisé' }).click();
    await demo.getByRole('checkbox', { name: /J’accepte/ }).click();
  }

  test('shows an error under each invalid field', async ({ page }) => {
    await openDesignSystem(page);

    await form(page).getByRole('button', { name: 'Envoyer ma réponse' }).click();

    await expect(form(page).getByText('Ce champ est obligatoire.')).toHaveCount(2);
    await expect(form(page).getByText('Cette case doit être cochée pour continuer.')).toBeVisible();
    await expect(form(page).getByRole('textbox', { name: /Nom complet/ })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  test('is disabled while sending, then confirms', async ({ page }) => {
    await openDesignSystem(page);
    await fillValidAnswer(page);

    await form(page).getByRole('button', { name: 'Envoyer ma réponse' }).click();

    await expect(form(page).getByRole('textbox', { name: /Nom complet/ })).toBeDisabled();
    await expect(
      page.getByRole('listitem').filter({ hasText: 'Réponse enregistrée' }),
    ).toBeVisible();
    await expect(form(page).getByRole('textbox', { name: /Nom complet/ })).toBeEnabled();
  });

  test('places a validation error of the API under its field', async ({ page }) => {
    await openDesignSystem(page);
    await form(page).getByRole('checkbox', { name: 'Simuler une erreur de l’API' }).click();
    await fillValidAnswer(page);

    await form(page).getByRole('button', { name: 'Envoyer ma réponse' }).click();

    await expect(form(page).getByRole('alert')).toContainText(
      'Certaines informations sont invalides',
    );
    await expect(form(page).getByText('Le format de cette valeur n’est pas valide.')).toBeVisible();
    await expect(form(page).getByRole('textbox', { name: /Adresse e-mail/ })).toBeFocused();
  });
});

test('calls the API through TanStack Query and shows its answer', async ({ page }) => {
  await openDesignSystem(page);

  await expect(page.getByText('L’API répond.')).toBeVisible();
});

test('translates an API failure, without any technical detail', async ({ page }) => {
  await openDesignSystem(page, {
    status: 403,
    body: { code: 'FORBIDDEN', message: 'Collaborator lacks permission guests:write', details: {} },
  });

  await expect(page.getByText('Vous n’avez pas accès à cette page.')).toBeVisible();
  await expect(page.getByText(/guests:write|Collaborator/)).toHaveCount(0);
});

test('leaves no text outside of the translations (keys language)', async ({ page }) => {
  await openDesignSystem(page);

  await page.getByRole('combobox', { name: 'Langue d’affichage' }).click();
  await page.getByRole('option', { name: 'Clés de traduction' }).click();

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('title');
  // Ce que perçoit l'utilisateur : le texte visible et celui des lecteurs d'écran, sans ce qui
  // est masqué à tous (aria-hidden : décorations, select natif caché de Radix).
  const words = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    /** @type {string[]} */
    const found = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (parent && !parent.closest('[aria-hidden="true"], script, style')) {
        found.push(...(node.textContent ?? '').split(/\s+/).filter(Boolean));
      }
    }
    return found;
  });
  expect(words.length).toBeGreaterThan(100);
  expect(words.filter((word) => !KEY_OR_COLOR.test(word))).toEqual([]);
});

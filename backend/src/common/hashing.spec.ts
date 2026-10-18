import { generateToken, hashSecret, sha256, verifySecret } from './hashing';

describe('hashing', () => {
  it('vérifie le bon secret et refuse un mauvais', async () => {
    const stored = await hashSecret('123456');
    expect(stored).not.toContain('123456');
    await expect(verifySecret('123456', stored)).resolves.toBe(true);
    await expect(verifySecret('654321', stored)).resolves.toBe(false);
  });

  it('produit une empreinte différente à chaque fois (sel aléatoire)', async () => {
    expect(await hashSecret('1234')).not.toBe(await hashSecret('1234'));
  });

  it('refuse un format stocké inconnu', async () => {
    await expect(verifySecret('1234', 'md5$abc')).resolves.toBe(false);
  });

  it('génère des jetons uniques et une empreinte SHA-256 stable', () => {
    const a = generateToken();
    expect(a).not.toBe(generateToken());
    expect(sha256(a)).toHaveLength(64);
    expect(sha256(a)).toBe(sha256(a));
  });
});

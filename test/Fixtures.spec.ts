import { dnGmxVaultFixture } from './fixtures/dn-gmx-vault';

describe('check fixtures', () => {
  it('works', async () => {
    const contracts = await dnGmxVaultFixture();
  });
});

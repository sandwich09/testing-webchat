import { FakeSecretCipher } from './fake-secret-cipher';
import { describeSecretCipherSuite } from './suites/secret-cipher.suite';

describeSecretCipherSuite(() => ({
  cipher: new FakeSecretCipher('key-one'),
  otherKeyCipher: new FakeSecretCipher('key-two'),
}));

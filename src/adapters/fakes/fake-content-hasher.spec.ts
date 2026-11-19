import { FakeContentHasher } from './fake-content-hasher';
import { describeContentHasherSuite } from './suites/content-hasher.suite';

describeContentHasherSuite(() => ({
  hasher: new FakeContentHasher('secret-one'),
  sessionSecret: 'secret-one',
  otherSecretHasher: new FakeContentHasher('secret-two'),
}));

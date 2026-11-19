import { describeRateLimitRepositorySuite } from './suites/rate-limit-repository.suite';
import { FakeRateLimitRepository } from './fake-rate-limit-repository';

describeRateLimitRepositorySuite(() => new FakeRateLimitRepository());

import { describeContactRepositorySuite } from './suites/contact-repository.suite';
import { FakeContactRepository } from './fake-contact-repository';

describeContactRepositorySuite(() => new FakeContactRepository());

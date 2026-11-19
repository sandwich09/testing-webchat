import { describeKnowledgeRepositorySuite } from './suites/knowledge-repository.suite';
import { FakeKnowledgeRepository } from './fake-knowledge-repository';

describeKnowledgeRepositorySuite(() => new FakeKnowledgeRepository());

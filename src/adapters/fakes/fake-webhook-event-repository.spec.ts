import { describeWebhookEventRepositorySuite } from './suites/webhook-event-repository.suite';
import { FakeWebhookEventRepository } from './fake-webhook-event-repository';

describeWebhookEventRepositorySuite(() => new FakeWebhookEventRepository());

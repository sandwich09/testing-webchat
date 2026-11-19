import { describeCannedReplyRepositorySuite } from './suites/canned-reply-repository.suite';
import { FakeCannedReplyRepository } from './fake-canned-reply-repository';

describeCannedReplyRepositorySuite(() => new FakeCannedReplyRepository());

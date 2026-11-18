import { InboxPage } from '@/features/inbox/InboxPage';

export default async function ChatPage({ params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  return <InboxPage contactId={contactId} />;
}

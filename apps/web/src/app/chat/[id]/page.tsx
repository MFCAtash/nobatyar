"use client";
import { useParams } from "next/navigation";
import { ChatContainer } from "@/components/chat/ChatContainer";

export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  return <ChatContainer conversationId={id} />;
}

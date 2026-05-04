import ChatSurface from "@/components/ChatSurface";
import { getInstancePrompts } from "@/lib/config/instance";

export default function Home() {
  const prompts = getInstancePrompts();
  return <ChatSurface initialPrompts={prompts} />;
}

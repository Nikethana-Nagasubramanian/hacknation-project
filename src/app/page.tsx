import { VoiceAgent } from "@/components/VoiceAgent";

export default function Home() {
  const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID || '';

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <main className="max-w-7xl mx-auto px-6 py-8">
        <VoiceAgent agentId={agentId} />
      </main>
    </div>
  );
}

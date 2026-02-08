import { VoiceAgent } from "@/components/VoiceAgent";

export default function Home() {
  const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID || '';

  return (
    <div className="flex min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full flex-col items-center py-12 gap-12">
        <div className="space-y-4 text-center">
          <h1 className="text-5xl font-extrabold tracking-tighter text-black dark:text-zinc-50">
            HackNation <span className="text-neutral-400">Booking</span>
          </h1>
          <p className="text-xl text-zinc-600 dark:text-zinc-400">
            Your voice-powered assistant for scheduling everything.
          </p>
        </div>

        <VoiceAgent agentId={agentId} />
      </main>
    </div>
  );
}

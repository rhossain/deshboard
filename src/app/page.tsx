import { NewsBoard } from "@/components/NewsBoard";
import { ACTIVE_SOURCES } from "@/lib/sources";

export default function Home() {
  return <NewsBoard sources={ACTIVE_SOURCES} />;
}

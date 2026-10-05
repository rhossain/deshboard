import { NewsBoard } from "@/components/NewsBoard";
import { SOURCES } from "@/lib/sources";

export default function Home() {
  return <NewsBoard sources={SOURCES} />;
}

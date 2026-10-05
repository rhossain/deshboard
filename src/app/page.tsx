import { NewsBoardFromUrl } from "@/components/NewsBoard";
import { SOURCES } from "@/lib/sources";

export default function Home() {
  return <NewsBoardFromUrl sources={SOURCES} />;
}

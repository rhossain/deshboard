import type { Metadata, ResolvingMetadata } from "next";
import { OutletPage, outletMetadata } from "@/components/pages/OutletPage";

type Props = { params: Promise<{ id: string }> };

// Its headlines and videos come from the server's cache, as it is when the page is asked for.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props, parent: ResolvingMetadata): Promise<Metadata> {
  return outletMetadata((await params).id, "en", parent);
}

/** One outlet's latest headlines and videos (in Bangla at /bn/sources/<id>). */
export default async function Outlet({ params }: Props) {
  return <OutletPage id={(await params).id} locale="en" />;
}

import type { Metadata, ResolvingMetadata } from "next";
import { OutletPage, outletMetadata, outletParams } from "@/components/pages/OutletPage";

type Props = { params: Promise<{ id: string }> };

// One page per outlet, prerendered (static export); any other address is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return outletParams();
}

export async function generateMetadata({ params }: Props, parent: ResolvingMetadata): Promise<Metadata> {
  return outletMetadata((await params).id, "en", parent);
}

/** One outlet's latest headlines and videos (in Bangla at /bn/sources/<id>/). */
export default async function Outlet({ params }: Props) {
  return <OutletPage id={(await params).id} locale="en" />;
}

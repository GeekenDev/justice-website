import { notFound } from "next/navigation";
import type { Metadata } from "next";
import AdminDeletedDescriptionsClient from "./page-client";

export const metadata: Metadata = {
  title: "Admin: Deleted Doc Descriptions",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminDeletedDescriptionsPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <AdminDeletedDescriptionsClient />;
}

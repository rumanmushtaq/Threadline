import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current";

/** The site's front door: the shop for everyone, the dashboard for a signed-in team member. */
export default async function Home() {
  redirect((await getCurrentUser()) ? "/dashboard" : "/shop");
}

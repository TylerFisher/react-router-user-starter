import type { Route } from "./+types/home";
import Layout from "~/components/Layout";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Newsletter recommender" },
    { name: "description", content: "Welcome to React Router!" },
  ];
}

export default function Home() {
  return(
    <Layout>
      <h1>Home</h1>
      <a href="/accounts/signup">Sign up</a>
    </Layout>
  );
}

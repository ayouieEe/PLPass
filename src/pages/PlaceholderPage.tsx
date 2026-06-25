import { StateMessage } from "@/components/feedback/StateMessage";

type PlaceholderPageProps = {
  title: string;
};

export function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <StateMessage
      title={`${title} placeholder`}
      description="This route is intentionally scaffolded only. Feature pages, authentication, attendance logic, and database integration belong to later phases."
    />
  );
}

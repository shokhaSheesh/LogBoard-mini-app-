import { Hammer } from "lucide-react";

// A tab whose screen hasn't been built yet. Honest about it, rather than an empty page.
export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="scroll">
      <h1 className="title">{title}</h1>
      <div className="center">
        <Hammer size={26} />
        <div>This screen is being built.</div>
      </div>
    </div>
  );
}

import Link from "next/link";

export default function Home() {
  return (
    <main className="grid min-h-dvh place-items-center bg-[#f6f7fb] px-6 py-12 text-[#22283f]">
      <section aria-labelledby="welcome-title" className="w-full max-w-md text-center">
        <div aria-hidden="true" className="mx-auto mb-7 grid size-16 place-items-center rounded-2xl bg-[#7363de] text-4xl font-semibold tracking-[-0.12em] text-white">
          b.
        </div>
        <h1 id="welcome-title" className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">Brisky</h1>
        <p className="mt-4 text-lg leading-relaxed text-[#6b7190]">Find the moment, not the file.</p>
        <Link href="/login" className="mt-8 inline-flex min-h-12 items-center justify-center rounded-full bg-[#7363de] px-7 py-3 font-medium text-white transition-colors hover:bg-[#6251cd] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#7363de]">
          Continue to Brisky
        </Link>
      </section>
    </main>
  );
}

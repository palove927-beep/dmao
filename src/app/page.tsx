export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-col items-center gap-8 px-8 py-16 text-center">
        <h1 className="text-5xl font-bold tracking-tight text-black dark:text-white">
          DMAO
        </h1>
        <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
          股票觀察清單與即時報價
        </p>
        <div className="flex gap-4">
          <a
            href="/stock"
            className="rounded-full bg-black px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            股票報價
          </a>
        </div>
      </main>
    </div>
  );
}

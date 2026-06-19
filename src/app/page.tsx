import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-zinc-900 mb-2">FAQ AEO Tool</h1>
        <p className="text-zinc-500 mb-8">Generador de FAQs optimizadas para Answer Engine Optimization</p>
        <Link
          href="/projects"
          className="inline-flex items-center px-6 py-3 bg-zinc-900 text-white rounded-lg hover:bg-zinc-700 transition-colors"
        >
          Ver proyectos →
        </Link>
      </div>
    </div>
  );
}

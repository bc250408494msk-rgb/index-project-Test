import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <nav className="px-6 py-4 border-b bg-white">
        <Link href="/" className="text-xl font-bold text-blue-600">IndexMeNow</Link>
      </nav>
      <div className="flex-1 flex items-center justify-center py-12 px-4">
        {children}
      </div>
    </div>
  );
}

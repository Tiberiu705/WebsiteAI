export const config = { matcher: ['/((?!api|_next|favicon).*)'] };

export default async function middleware(request) {
  const host = (request.headers.get('host') || '').split(':')[0].toLowerCase();

  // Skip main domain and Vercel preview URLs
  if (
    host === 'websiteai.ro' ||
    host === 'www.websiteai.ro' ||
    host.endsWith('.vercel.app') ||
    host.startsWith('localhost') ||
    host.startsWith('127.')
  ) {
    return; // Serve normally
  }

  // Custom domain — fetch site HTML and return it
  try {
    const origin = `https://websiteai.ro`;
    const response = await fetch(`${origin}/api/serve-domain?domain=${encodeURIComponent(host)}`);
    const html = await response.text();
    return new Response(html, {
      status: response.status,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch {
    return new Response('Eroare server', { status: 500 });
  }
}

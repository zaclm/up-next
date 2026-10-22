import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Up Next',
    short_name: 'Up Next',
    description: 'Decide what your group plays next.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0e0f12',
    theme_color: '#0e0f12',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  }
}

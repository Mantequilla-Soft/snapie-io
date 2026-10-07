import { describe, expect, it } from 'vitest'
import { DEFAULT_FACTORY_URL, factoryAppUrl, factoryEmbedUrl, resolveFactoryOrigin } from './config'

describe('resolveFactoryOrigin', () => {
  it('uses the default when unset or blank', () => {
    expect(resolveFactoryOrigin(undefined)).toBe(DEFAULT_FACTORY_URL)
    expect(resolveFactoryOrigin('')).toBe(DEFAULT_FACTORY_URL)
    expect(resolveFactoryOrigin('   ')).toBe(DEFAULT_FACTORY_URL)
  })
  it('keeps just the origin of an https URL', () => {
    expect(resolveFactoryOrigin('https://factory.snapie.io')).toBe('https://factory.snapie.io')
    expect(resolveFactoryOrigin(' https://factory.snapie.io/embed?x=1#y ')).toBe('https://factory.snapie.io')
  })
  it('allows http only on localhost', () => {
    expect(resolveFactoryOrigin('http://localhost:8080')).toBe('http://localhost:8080')
    expect(resolveFactoryOrigin('http://127.0.0.1:8080/x')).toBe('http://127.0.0.1:8080')
    expect(resolveFactoryOrigin('http://factory.example')).toBe(DEFAULT_FACTORY_URL)
  })
  it('falls back for anything that could not be a safe frame source', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,<script>1</script>', 'ftp://x.example', 'not a url', '//evil.example']) {
      expect(resolveFactoryOrigin(bad)).toBe(DEFAULT_FACTORY_URL)
    }
  })
})

describe('urls', () => {
  it('builds the embed and app addresses from an origin', () => {
    expect(factoryEmbedUrl('https://factory.example')).toBe('https://factory.example/embed?autoplay=1')
    expect(factoryAppUrl('https://factory.example')).toBe('https://factory.example/')
  })
})

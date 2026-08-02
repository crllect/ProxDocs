# Search engines

Whatever you set as the default search engine is the first proxied page most
people will ever load, so if it renders badly your proxy looks broken before
anyone has typed a real URL.

They do not all behave the same through a proxy, and the one that works on your
laptop is often not the one that works in production.

## Brave

The default in the generated projects. Template:
`https://search.brave.com/search?q=%s`.

It has worked consistently in testing with both generated engine adapters.
Results pages are mostly server-rendered, which reduces client-side rewriting.

## Google

Template: `https://www.google.com/search?q=%s`.

Works fine in development and usually does not in production, which makes it a
trap. On `localhost` you look like an ordinary browser on a residential
connection and everything is fine. Once your proxy is on a server, requests
arrive from a datacentre IP that has already served a lot of automated traffic,
and you start getting consent walls, interstitials, and eventually a CAPTCHA
that no amount of rewriting will get you past.

Nothing is wrong with your proxy when this happens. Google is deciding your
server's IP is not a person. It is worth knowing before you spend an evening
debugging the rewriter.

## DuckDuckGo

Template: `https://duckduckgo.com/?q=%s`.

Works most of the time, and has two specific problems.

The results page is heavily client-rendered, so it relies on the JavaScript
rewriter. Under Scramjet that is usually fine. Under Ultraviolet it is one of
the more reliable ways to see the older rewriter struggle, with results that
render partially or not at all.

It also redirects more than you would expect. `duckduckgo.com/?q=` bounces to
`html.duckduckgo.com` or to a regional host depending on where the request
appears to come from, and each hop has to be rewritten correctly. When a search
lands on a blank page, follow the redirect chain in the network tab before
assuming the query was wrong.

## Startpage and Bing

| Engine    | Template                                       |
| --------- | ---------------------------------------------- |
| Startpage | `https://www.startpage.com/sp/search?query=%s` |
| Bing      | `https://www.bing.com/search?q=%s`             |

Both are useful fallbacks. Test them from the production server because consent
pages and rate limits depend on the outbound IP.

## Using something else

The validator accepts any HTTP or HTTPS URL containing `%s`:

```js
const searchEngine = "https://searx.crllect.dev/search?q=%s";
```

The generated form shows the entries in `SEARCH_ENGINES`. Add a custom template
to that list, or pass it to `settings.set()` from your own UI. Invalid templates
fall back to the default. See [Settings](settings.md).

## Testing a search engine

Test against a deployed instance, not `localhost`. The differences that matter
are all about where the request appears to come from.

Three searches will tell you most of what you need:

1. A plain word, to check the results page renders.
2. A phrase with quotes and punctuation, to check the query is encoded correctly
   rather than truncated at the first special character.
3. Clicking through to a result, to check the outbound link is rewritten and
   does not escape the proxy.

If the third one leaves your proxy, the search engine is wrapping results in a
redirector your rewriter is not handling. That is a proxy problem, not a search
engine problem.

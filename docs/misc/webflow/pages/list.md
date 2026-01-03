# List Pages

GET https://api.webflow.com/v2/sites/{site_id}/pages

List of all pages for a site.

Required scope | `pages:read`


Reference: https://developers.webflow.com/data/reference/pages-and-components/pages/list

## OpenAPI Specification

```yaml
openapi: 3.1.1
info:
  title: List Pages
  version: endpoint_pages.list
paths:
  /sites/{site_id}/pages:
    get:
      operationId: list
      summary: List Pages
      description: |
        List of all pages for a site.

        Required scope | `pages:read`
      tags:
        - - subpackage_pages
      parameters:
        - name: site_id
          in: path
          description: Unique identifier for a Site
          required: true
          schema:
            type: string
            format: objectid
        - name: localeId
          in: query
          description: >
            Unique identifier for a specific Locale.


            [Lear more about
            localization.](/data/v2.0.0/docs/working-with-localization)
          required: false
          schema:
            type: string
        - name: limit
          in: query
          description: 'Maximum number of records to be returned (max limit: 100)'
          required: false
          schema:
            type: number
            format: double
        - name: offset
          in: query
          description: >-
            Offset used for pagination if the results have more than limit
            records
          required: false
          schema:
            type: number
            format: double
        - name: Authorization
          in: header
          description: >-
            Bearer authentication of the form `Bearer <token>`, where token is
            your auth token.
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Request was successful
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/pages_list_Response_200'
        '400':
          description: Request body was incorrectly formatted.
          content: {}
        '401':
          description: >-
            Provided access token is invalid or does not have access to
            requested resource
          content: {}
        '404':
          description: Requested resource not found
          content: {}
        '429':
          description: >-
            The rate limit of the provided access_token has been reached. Please
            have your application respect the X-RateLimit-Remaining header we
            include on API responses.
          content: {}
        '500':
          description: We had a problem with our server. Try again later.
          content: {}
components:
  schemas:
    SitesSiteIdPagesGetResponsesContentApplicationJsonSchemaPagesItemsSeo:
      type: object
      properties:
        title:
          type: string
          description: The Page title shown in search engine results
        description:
          type: string
          description: The Page description shown in search engine results
    SitesSiteIdPagesGetResponsesContentApplicationJsonSchemaPagesItemsOpenGraph:
      type: object
      properties:
        title:
          type: string
          description: The title supplied to Open Graph annotations
        titleCopied:
          type: boolean
          default: true
          description: Indicates the Open Graph title was copied from the SEO title
        description:
          type: string
          description: The description supplied to Open Graph annotations
        descriptionCopied:
          type: boolean
          default: true
          description: >-
            Indicates the Open Graph description was copied from the SEO
            description
    SitesSiteIdPagesGetResponsesContentApplicationJsonSchemaPagesItems:
      type: object
      properties:
        id:
          type: string
          format: objectid
          description: Unique identifier for the Page
        siteId:
          type: string
          format: objectid
          description: Unique identifier for the Site
        title:
          type: string
          description: Title of the Page
        slug:
          type: string
          description: slug of the Page (derived from title)
        parentId:
          type: string
          format: objectid
          description: Identifier of the parent folder
        collectionId:
          type: string
          format: objectid
          description: >-
            Unique identifier for a linked Collection, value will be null if the
            Page is not part of a Collection.
        createdOn:
          type: string
          format: date-time
          description: The date the Page was created
        lastUpdated:
          type: string
          format: date-time
          description: The date the Page was most recently updated
        archived:
          type: boolean
          default: false
          description: Whether the Page has been archived
        draft:
          type: boolean
          default: false
          description: Whether the Page is a draft
        canBranch:
          type: boolean
          default: false
          description: >-
            Indicates whether the Page supports [Page
            Branching](https://university.webflow.com/lesson/page-branching).
            Pages that are already branches cannot be branched again.
        isBranch:
          type: boolean
          default: false
          description: >-
            Indicates whether the Page is a Branch of another Page [Page
            Branching](https://university.webflow.com/lesson/page-branching)
        branchId:
          type:
            - string
            - 'null'
          format: objectid
          description: >-
            If the Page is a Branch of another Page, this is the ID of the
            Branch
        seo:
          $ref: >-
            #/components/schemas/SitesSiteIdPagesGetResponsesContentApplicationJsonSchemaPagesItemsSeo
          description: SEO-related fields for the Page
        openGraph:
          $ref: >-
            #/components/schemas/SitesSiteIdPagesGetResponsesContentApplicationJsonSchemaPagesItemsOpenGraph
          description: Open Graph fields for the Page
        localeId:
          type:
            - string
            - 'null'
          format: objectid
          description: Unique ID of the page locale
        publishedPath:
          type: string
          description: Relative path of the published page URL
      required:
        - id
    SitesSiteIdPagesGetResponsesContentApplicationJsonSchemaPagination:
      type: object
      properties:
        limit:
          type: number
          format: double
          description: The limit used for pagination
        offset:
          type: number
          format: double
          description: The offset used for pagination
        total:
          type: number
          format: double
          description: The total number of records
      required:
        - limit
        - offset
        - total
    pages_list_Response_200:
      type: object
      properties:
        pages:
          type: array
          items:
            $ref: >-
              #/components/schemas/SitesSiteIdPagesGetResponsesContentApplicationJsonSchemaPagesItems
        pagination:
          $ref: >-
            #/components/schemas/SitesSiteIdPagesGetResponsesContentApplicationJsonSchemaPagination
          description: Pagination object

```

## SDK Code Examples

```python
from webflow import Webflow

client = Webflow(
    access_token="YOUR_ACCESS_TOKEN",
)
client.pages.list(
    site_id="580e63e98c9a982ac9b8b741",
    locale_id="65427cf400e02b306eaa04a0",
    limit=1.1,
    offset=1.1,
)

```

```typescript
import { WebflowClient } from "webflow-api";

const client = new WebflowClient({ accessToken: "YOUR_ACCESS_TOKEN" });
await client.pages.list("580e63e98c9a982ac9b8b741", {
    localeId: "65427cf400e02b306eaa04a0",
    limit: 1.1,
    offset: 1.1
});

```

```go
package main

import (
	"fmt"
	"net/http"
	"io"
)

func main() {

	url := "https://api.webflow.com/v2/sites/580e63e98c9a982ac9b8b741/pages?localeId=65427cf400e02b306eaa04a0&limit=100&offset=0"

	req, _ := http.NewRequest("GET", url, nil)

	req.Header.Add("Authorization", "Bearer <token>")

	res, _ := http.DefaultClient.Do(req)

	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)

	fmt.Println(res)
	fmt.Println(string(body))

}
```

```ruby
require 'uri'
require 'net/http'

url = URI("https://api.webflow.com/v2/sites/580e63e98c9a982ac9b8b741/pages?localeId=65427cf400e02b306eaa04a0&limit=100&offset=0")

http = Net::HTTP.new(url.host, url.port)
http.use_ssl = true

request = Net::HTTP::Get.new(url)
request["Authorization"] = 'Bearer <token>'

response = http.request(request)
puts response.read_body
```

```java
HttpResponse<String> response = Unirest.get("https://api.webflow.com/v2/sites/580e63e98c9a982ac9b8b741/pages?localeId=65427cf400e02b306eaa04a0&limit=100&offset=0")
  .header("Authorization", "Bearer <token>")
  .asString();
```

```php
<?php

$client = new \GuzzleHttp\Client();

$response = $client->request('GET', 'https://api.webflow.com/v2/sites/580e63e98c9a982ac9b8b741/pages?localeId=65427cf400e02b306eaa04a0&limit=100&offset=0', [
  'headers' => [
    'Authorization' => 'Bearer <token>',
  ],
]);

echo $response->getBody();
```

```csharp
var client = new RestClient("https://api.webflow.com/v2/sites/580e63e98c9a982ac9b8b741/pages?localeId=65427cf400e02b306eaa04a0&limit=100&offset=0");
var request = new RestRequest(Method.GET);
request.AddHeader("Authorization", "Bearer <token>");
IRestResponse response = client.Execute(request);
```

```swift
import Foundation

let headers = ["Authorization": "Bearer <token>"]

let request = NSMutableURLRequest(url: NSURL(string: "https://api.webflow.com/v2/sites/580e63e98c9a982ac9b8b741/pages?localeId=65427cf400e02b306eaa04a0&limit=100&offset=0")! as URL,
                                        cachePolicy: .useProtocolCachePolicy,
                                    timeoutInterval: 10.0)
request.httpMethod = "GET"
request.allHTTPHeaderFields = headers

let session = URLSession.shared
let dataTask = session.dataTask(with: request as URLRequest, completionHandler: { (data, response, error) -> Void in
  if (error != nil) {
    print(error as Any)
  } else {
    let httpResponse = response as? HTTPURLResponse
    print(httpResponse)
  }
})

dataTask.resume()
```
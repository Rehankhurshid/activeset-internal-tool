# Update Page Metadata

PUT https://api.webflow.com/v2/pages/{page_id}
Content-Type: application/json

Update Page-level metadata, including SEO and Open Graph fields.

Required scope | `pages:write`


Reference: https://developers.webflow.com/data/reference/pages-and-components/pages/update-page-settings

## OpenAPI Specification

```yaml
openapi: 3.1.1
info:
  title: Update Page Metadata
  version: endpoint_pages.update-page-settings
paths:
  /pages/{page_id}:
    put:
      operationId: update-page-settings
      summary: Update Page Metadata
      description: |
        Update Page-level metadata, including SEO and Open Graph fields.

        Required scope | `pages:write`
      tags:
        - - subpackage_pages
      parameters:
        - name: page_id
          in: path
          description: Unique identifier for a Page
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
                $ref: '#/components/schemas/Pages_update-page-settings_Response_200'
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
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                title:
                  type: string
                  description: Title for the page
                slug:
                  type: string
                  description: >
                    Slug for the page. 



                    **Note:** Updating slugs in secondary locales is only
                    supported in <a
                    href="https://webflow.com/localization">Advanced and
                    Enterprise localization add-on plans.</a>
                seo:
                  $ref: >-
                    #/components/schemas/PagesPageIdPutRequestBodyContentApplicationJsonSchemaSeo
                  description: SEO-related fields for the Page
                openGraph:
                  $ref: >-
                    #/components/schemas/PagesPageIdPutRequestBodyContentApplicationJsonSchemaOpenGraph
                  description: Open Graph fields for the Page
components:
  schemas:
    PagesPageIdPutRequestBodyContentApplicationJsonSchemaSeo:
      type: object
      properties:
        title:
          type: string
          description: The Page title shown in search engine results
        description:
          type: string
          description: The Page description shown in search engine results
    PagesPageIdPutRequestBodyContentApplicationJsonSchemaOpenGraph:
      type: object
      properties:
        title:
          type: string
          description: The title supplied to Open Graph annotations
        titleCopied:
          type: boolean
          description: Indicates the Open Graph title was copied from the SEO title
        description:
          type: string
          description: The description supplied to Open Graph annotations
        descriptionCopied:
          type: boolean
          description: >-
            Indicates the Open Graph description was copied from the SEO
            description
    PagesPageIdPutResponsesContentApplicationJsonSchemaSeo:
      type: object
      properties:
        title:
          type: string
          description: The Page title shown in search engine results
        description:
          type: string
          description: The Page description shown in search engine results
    PagesPageIdPutResponsesContentApplicationJsonSchemaOpenGraph:
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
    Pages_update-page-settings_Response_200:
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
            #/components/schemas/PagesPageIdPutResponsesContentApplicationJsonSchemaSeo
          description: SEO-related fields for the Page
        openGraph:
          $ref: >-
            #/components/schemas/PagesPageIdPutResponsesContentApplicationJsonSchemaOpenGraph
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

```

## SDK Code Examples

```python
from webflow import Webflow
from webflow.resources.pages import (
    PageMetadataWriteOpenGraph,
    PageMetadataWriteSeo,
)

client = Webflow(
    access_token="YOUR_ACCESS_TOKEN",
)
client.pages.update_page_settings(
    page_id="63c720f9347c2139b248e552",
    locale_id="65427cf400e02b306eaa04a0",
    title="Guide to the Galaxy",
    slug="guide-to-the-galaxy",
    seo=PageMetadataWriteSeo(
        title="The Ultimate Hitchhiker's Guide to the Galaxy",
        description="Everything you need to know about the galaxy, from avoiding Vogon poetry to the importance of towels.",
    ),
    open_graph=PageMetadataWriteOpenGraph(
        title="Explore the Cosmos with The Ultimate Guide",
        title_copied=False,
        description="Dive deep into the mysteries of the universe with your guide to everything galactic.",
        description_copied=False,
    ),
)

```

```typescript
import { WebflowClient } from "webflow-api";

const client = new WebflowClient({ accessToken: "YOUR_ACCESS_TOKEN" });
await client.pages.updatePageSettings("63c720f9347c2139b248e552", {
    localeId: "65427cf400e02b306eaa04a0",
    title: "Guide to the Galaxy",
    slug: "guide-to-the-galaxy",
    seo: {
        title: "The Ultimate Hitchhiker's Guide to the Galaxy",
        description: "Everything you need to know about the galaxy, from avoiding Vogon poetry to the importance of towels."
    },
    openGraph: {
        title: "Explore the Cosmos with The Ultimate Guide",
        titleCopied: false,
        description: "Dive deep into the mysteries of the universe with your guide to everything galactic.",
        descriptionCopied: false
    }
});

```

```go
package main

import (
	"fmt"
	"strings"
	"net/http"
	"io"
)

func main() {

	url := "https://api.webflow.com/v2/pages/63c720f9347c2139b248e552?localeId=65427cf400e02b306eaa04a0"

	payload := strings.NewReader("{\n  \"title\": \"Guide to the Galaxy\",\n  \"slug\": \"guide-to-the-galaxy\",\n  \"seo\": {\n    \"title\": \"The Ultimate Hitchhiker's Guide to the Galaxy\",\n    \"description\": \"Everything you need to know about the galaxy, from avoiding Vogon poetry to the importance of towels.\"\n  },\n  \"openGraph\": {\n    \"title\": \"Explore the Cosmos with The Ultimate Guide\",\n    \"titleCopied\": false,\n    \"description\": \"Dive deep into the mysteries of the universe with your guide to everything galactic.\",\n    \"descriptionCopied\": false\n  }\n}")

	req, _ := http.NewRequest("PUT", url, payload)

	req.Header.Add("Authorization", "Bearer <token>")
	req.Header.Add("Content-Type", "application/json")

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

url = URI("https://api.webflow.com/v2/pages/63c720f9347c2139b248e552?localeId=65427cf400e02b306eaa04a0")

http = Net::HTTP.new(url.host, url.port)
http.use_ssl = true

request = Net::HTTP::Put.new(url)
request["Authorization"] = 'Bearer <token>'
request["Content-Type"] = 'application/json'
request.body = "{\n  \"title\": \"Guide to the Galaxy\",\n  \"slug\": \"guide-to-the-galaxy\",\n  \"seo\": {\n    \"title\": \"The Ultimate Hitchhiker's Guide to the Galaxy\",\n    \"description\": \"Everything you need to know about the galaxy, from avoiding Vogon poetry to the importance of towels.\"\n  },\n  \"openGraph\": {\n    \"title\": \"Explore the Cosmos with The Ultimate Guide\",\n    \"titleCopied\": false,\n    \"description\": \"Dive deep into the mysteries of the universe with your guide to everything galactic.\",\n    \"descriptionCopied\": false\n  }\n}"

response = http.request(request)
puts response.read_body
```

```java
HttpResponse<String> response = Unirest.put("https://api.webflow.com/v2/pages/63c720f9347c2139b248e552?localeId=65427cf400e02b306eaa04a0")
  .header("Authorization", "Bearer <token>")
  .header("Content-Type", "application/json")
  .body("{\n  \"title\": \"Guide to the Galaxy\",\n  \"slug\": \"guide-to-the-galaxy\",\n  \"seo\": {\n    \"title\": \"The Ultimate Hitchhiker's Guide to the Galaxy\",\n    \"description\": \"Everything you need to know about the galaxy, from avoiding Vogon poetry to the importance of towels.\"\n  },\n  \"openGraph\": {\n    \"title\": \"Explore the Cosmos with The Ultimate Guide\",\n    \"titleCopied\": false,\n    \"description\": \"Dive deep into the mysteries of the universe with your guide to everything galactic.\",\n    \"descriptionCopied\": false\n  }\n}")
  .asString();
```

```php
<?php

$client = new \GuzzleHttp\Client();

$response = $client->request('PUT', 'https://api.webflow.com/v2/pages/63c720f9347c2139b248e552?localeId=65427cf400e02b306eaa04a0', [
  'body' => '{
  "title": "Guide to the Galaxy",
  "slug": "guide-to-the-galaxy",
  "seo": {
    "title": "The Ultimate Hitchhiker\'s Guide to the Galaxy",
    "description": "Everything you need to know about the galaxy, from avoiding Vogon poetry to the importance of towels."
  },
  "openGraph": {
    "title": "Explore the Cosmos with The Ultimate Guide",
    "titleCopied": false,
    "description": "Dive deep into the mysteries of the universe with your guide to everything galactic.",
    "descriptionCopied": false
  }
}',
  'headers' => [
    'Authorization' => 'Bearer <token>',
    'Content-Type' => 'application/json',
  ],
]);

echo $response->getBody();
```

```csharp
var client = new RestClient("https://api.webflow.com/v2/pages/63c720f9347c2139b248e552?localeId=65427cf400e02b306eaa04a0");
var request = new RestRequest(Method.PUT);
request.AddHeader("Authorization", "Bearer <token>");
request.AddHeader("Content-Type", "application/json");
request.AddParameter("application/json", "{\n  \"title\": \"Guide to the Galaxy\",\n  \"slug\": \"guide-to-the-galaxy\",\n  \"seo\": {\n    \"title\": \"The Ultimate Hitchhiker's Guide to the Galaxy\",\n    \"description\": \"Everything you need to know about the galaxy, from avoiding Vogon poetry to the importance of towels.\"\n  },\n  \"openGraph\": {\n    \"title\": \"Explore the Cosmos with The Ultimate Guide\",\n    \"titleCopied\": false,\n    \"description\": \"Dive deep into the mysteries of the universe with your guide to everything galactic.\",\n    \"descriptionCopied\": false\n  }\n}", ParameterType.RequestBody);
IRestResponse response = client.Execute(request);
```

```swift
import Foundation

let headers = [
  "Authorization": "Bearer <token>",
  "Content-Type": "application/json"
]
let parameters = [
  "title": "Guide to the Galaxy",
  "slug": "guide-to-the-galaxy",
  "seo": [
    "title": "The Ultimate Hitchhiker's Guide to the Galaxy",
    "description": "Everything you need to know about the galaxy, from avoiding Vogon poetry to the importance of towels."
  ],
  "openGraph": [
    "title": "Explore the Cosmos with The Ultimate Guide",
    "titleCopied": false,
    "description": "Dive deep into the mysteries of the universe with your guide to everything galactic.",
    "descriptionCopied": false
  ]
] as [String : Any]

let postData = JSONSerialization.data(withJSONObject: parameters, options: [])

let request = NSMutableURLRequest(url: NSURL(string: "https://api.webflow.com/v2/pages/63c720f9347c2139b248e552?localeId=65427cf400e02b306eaa04a0")! as URL,
                                        cachePolicy: .useProtocolCachePolicy,
                                    timeoutInterval: 10.0)
request.httpMethod = "PUT"
request.allHTTPHeaderFields = headers
request.httpBody = postData as Data

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
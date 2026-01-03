# Create Collection

POST https://api.webflow.com/v2/sites/{site_id}/collections
Content-Type: application/json

Create a Collection for a site with collection fields.

Each collection includes the required _name_ and _slug_ fields, which are generated automatically. You can update the `displayName` of these fields, but the slug for them cannot be changed. Fields slugs are automatically converted to lowercase. Spaces in slugs are replaced with hyphens.

Required scope | `cms:write`


Reference: https://developers.webflow.com/data/reference/cms/collections/create

## OpenAPI Specification

```yaml
openapi: 3.1.1
info:
  title: Create Collection
  version: endpoint_collections.create
paths:
  /sites/{site_id}/collections:
    post:
      operationId: create
      summary: Create Collection
      description: >
        Create a Collection for a site with collection fields.


        Each collection includes the required _name_ and _slug_ fields, which
        are generated automatically. You can update the `displayName` of these
        fields, but the slug for them cannot be changed. Fields slugs are
        automatically converted to lowercase. Spaces in slugs are replaced with
        hyphens.


        Required scope | `cms:write`
      tags:
        - - subpackage_collections
      parameters:
        - name: site_id
          in: path
          description: Unique identifier for a Site
          required: true
          schema:
            type: string
            format: objectid
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
                $ref: '#/components/schemas/collections_create_Response_200'
        '400':
          description: Validation failure
          content: {}
        '401':
          description: >-
            Provided access token is invalid or does not have access to
            requested resource
          content: {}
        '404':
          description: Requested resource not found
          content: {}
        '409':
          description: Collection already exists
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
        description: >-
          Pass the Name of the collection, as well as the singular name of each
          item in the collection.
        content:
          application/json:
            schema:
              type: object
              properties:
                displayName:
                  type: string
                  description: >-
                    Name of the collection. Each collection name must be
                    distinct.
                singularName:
                  type: string
                  description: Singular name of each item.
                slug:
                  type: string
                  description: Part of a URL that identifier
                fields:
                  type: array
                  items:
                    $ref: >-
                      #/components/schemas/SitesSiteIdCollectionsPostRequestBodyContentApplicationJsonSchemaFieldsItems
                  description: An array of custom fields to add to the collection
              required:
                - displayName
                - singularName
components:
  schemas:
    SitesSiteIdCollectionsPostRequestBodyContentApplicationJsonSchemaFieldsItemsOneOf0Type:
      type: string
      enum:
        - value: Color
        - value: DateTime
        - value: Email
        - value: File
        - value: Image
        - value: Link
        - value: MultiImage
        - value: Number
        - value: Phone
        - value: PlainText
        - value: RichText
        - value: Switch
        - value: VideoLink
    SitesSiteIdCollectionsPostRequestBodyContentApplicationJsonSchemaFieldsItems0:
      type: object
      properties:
        id:
          type: string
          format: objectid
          description: Unique identifier for a Field
        isEditable:
          type: boolean
          description: Define whether the field is editable
        isRequired:
          type: boolean
          description: define whether a field is required in a collection
        type:
          $ref: >-
            #/components/schemas/SitesSiteIdCollectionsPostRequestBodyContentApplicationJsonSchemaFieldsItemsOneOf0Type
          description: Choose these appropriate field type for your collection data
        displayName:
          type: string
          description: The name of a field
        helpText:
          type: string
          description: Additional text to help anyone filling out this field
      required:
        - type
        - displayName
    SitesSiteIdCollectionsPostRequestBodyContentApplicationJsonSchemaFieldsItemsOneOf1Type:
      type: string
      enum:
        - value: Option
    SitesSiteIdCollectionsPostRequestBodyContentApplicationJsonSchemaFieldsItemsOneOf1MetadataOptionsItems:
      type: object
      properties:
        name:
          type: string
          description: The name of the option
        id:
          type: string
          description: The unique identifier of the option
      required:
        - name
    SitesSiteIdCollectionsPostRequestBodyContentApplicationJsonSchemaFieldsItemsOneOf1Metadata:
      type: object
      properties:
        options:
          type: array
          items:
            $ref: >-
              #/components/schemas/SitesSiteIdCollectionsPostRequestBodyContentApplicationJsonSchemaFieldsItemsOneOf1MetadataOptionsItems
          description: The option values for the Option field.
      required:
        - options
    SitesSiteIdCollectionsPostRequestBodyContentApplicationJsonSchemaFieldsItems1:
      type: object
      properties:
        id:
          type: string
          format: objectid
          description: Unique identifier for a Field
        isEditable:
          type: boolean
          description: Define whether the field is editable
        isRequired:
          type: boolean
          description: define whether a field is required in a collection
        type:
          $ref: >-
            #/components/schemas/SitesSiteIdCollectionsPostRequestBodyContentApplicationJsonSchemaFieldsItemsOneOf1Type
          description: >-
            The [Option field
            type](/data/reference/field-types-item-values#option)
        displayName:
          type: string
          description: The name of a field
        helpText:
          type: string
          description: Additional text to help anyone filling out this field
        metadata:
          $ref: >-
            #/components/schemas/SitesSiteIdCollectionsPostRequestBodyContentApplicationJsonSchemaFieldsItemsOneOf1Metadata
          description: The metadata for the Option field.
      required:
        - type
        - displayName
        - metadata
    SitesSiteIdCollectionsPostRequestBodyContentApplicationJsonSchemaFieldsItemsOneOf2Type:
      type: string
      enum:
        - value: MultiReference
        - value: Reference
    SitesSiteIdCollectionsPostRequestBodyContentApplicationJsonSchemaFieldsItemsOneOf2Metadata:
      type: object
      properties:
        collectionId:
          type: string
          description: The unique identifier of the collection
      required:
        - collectionId
    SitesSiteIdCollectionsPostRequestBodyContentApplicationJsonSchemaFieldsItems2:
      type: object
      properties:
        id:
          type: string
          format: objectid
          description: Unique identifier for a Field
        isEditable:
          type: boolean
          description: Define whether the field is editable
        isRequired:
          type: boolean
          description: define whether a field is required in a collection
        type:
          $ref: >-
            #/components/schemas/SitesSiteIdCollectionsPostRequestBodyContentApplicationJsonSchemaFieldsItemsOneOf2Type
          description: Choose these appropriate field type for your collection data
        displayName:
          type: string
          description: The name of a field
        helpText:
          type: string
          description: Additional text to help anyone filling out this field
        metadata:
          $ref: >-
            #/components/schemas/SitesSiteIdCollectionsPostRequestBodyContentApplicationJsonSchemaFieldsItemsOneOf2Metadata
          description: >-
            The collectionId for the referenced collection. Only applicable for
            Reference and MultiReference fields.
      required:
        - type
        - displayName
        - metadata
    SitesSiteIdCollectionsPostRequestBodyContentApplicationJsonSchemaFieldsItems:
      oneOf:
        - $ref: >-
            #/components/schemas/SitesSiteIdCollectionsPostRequestBodyContentApplicationJsonSchemaFieldsItems0
        - $ref: >-
            #/components/schemas/SitesSiteIdCollectionsPostRequestBodyContentApplicationJsonSchemaFieldsItems1
        - $ref: >-
            #/components/schemas/SitesSiteIdCollectionsPostRequestBodyContentApplicationJsonSchemaFieldsItems2
    SitesSiteIdCollectionsPostResponsesContentApplicationJsonSchemaFieldsItemsType:
      type: string
      enum:
        - value: Color
        - value: DateTime
        - value: Email
        - value: ExtFileRef
        - value: File
        - value: Image
        - value: Link
        - value: MultiImage
        - value: MultiReference
        - value: Number
        - value: Option
        - value: Phone
        - value: PlainText
        - value: Reference
        - value: RichText
        - value: Switch
        - value: VideoLink
    SitesSiteIdCollectionsPostResponsesContentApplicationJsonSchemaFieldsItemsValidationsAdditionalProperties:
      oneOf:
        - type: string
        - type: number
          format: double
        - type: boolean
        - type: integer
        - type: object
          additionalProperties:
            description: Any type
    SitesSiteIdCollectionsPostResponsesContentApplicationJsonSchemaFieldsItemsValidations:
      type: object
      properties:
        additionalProperties:
          $ref: >-
            #/components/schemas/SitesSiteIdCollectionsPostResponsesContentApplicationJsonSchemaFieldsItemsValidationsAdditionalProperties
    SitesSiteIdCollectionsPostResponsesContentApplicationJsonSchemaFieldsItems:
      type: object
      properties:
        id:
          type: string
          format: objectid
          description: Unique identifier for a Field
        isRequired:
          type: boolean
          description: define whether a field is required in a collection
        isEditable:
          type: boolean
          description: Define whether the field is editable
        type:
          $ref: >-
            #/components/schemas/SitesSiteIdCollectionsPostResponsesContentApplicationJsonSchemaFieldsItemsType
          description: Choose these appropriate field type for your collection data
        slug:
          type: string
          description: >-
            Slug of Field in Site URL structure. Slugs should be all lowercase
            with no spaces. Any spaces will be converted to "-."
        displayName:
          type: string
          description: The name of a field
        helpText:
          type: string
          description: Additional text to help anyone filling out this field
        validations:
          oneOf:
            - $ref: >-
                #/components/schemas/SitesSiteIdCollectionsPostResponsesContentApplicationJsonSchemaFieldsItemsValidations
            - type: 'null'
          description: The validations for the field
      required:
        - id
        - isRequired
        - type
        - displayName
    collections_create_Response_200:
      type: object
      properties:
        id:
          type: string
          format: objectid
          description: Unique identifier for a Collection
        displayName:
          type: string
          description: Name given to the Collection
        singularName:
          type: string
          description: >-
            The name of one Item in Collection (e.g. ”Blog Post” if the
            Collection is called “Blog Posts”)
        slug:
          type: string
          description: Slug of Collection in Site URL structure
        createdOn:
          type: string
          format: date-time
          description: The date the collection was created
        lastUpdated:
          type: string
          format: date-time
          description: The date the collection was last updated
        fields:
          type: array
          items:
            $ref: >-
              #/components/schemas/SitesSiteIdCollectionsPostResponsesContentApplicationJsonSchemaFieldsItems
          description: The list of fields in the Collection
      required:
        - id
        - displayName
        - singularName
        - fields

```

## SDK Code Examples

```python
from webflow import ReferenceField, ReferenceFieldMetadata, StaticField, Webflow

client = Webflow(
    access_token="YOUR_ACCESS_TOKEN",
)
client.collections.create(
    site_id="580e63e98c9a982ac9b8b741",
    display_name="Blog Posts",
    singular_name="Blog Post",
    slug="posts",
    fields=[
        StaticField(
            is_required=True,
            type="PlainText",
            display_name="Title",
            help_text="The title of the blog post",
        ),
        StaticField(
            is_required=True,
            type="RichText",
            display_name="Content",
            help_text="The content of the blog post",
        ),
        ReferenceField(
            is_required=True,
            type="Reference",
            display_name="Author",
            help_text="The author of the blog post",
            metadata=ReferenceFieldMetadata(
                collection_id="23cc2d952d4e4631ffd4345d2743db4e",
            ),
        ),
    ],
)

```

```typescript
import { WebflowClient } from "webflow-api";

const client = new WebflowClient({ accessToken: "YOUR_ACCESS_TOKEN" });
await client.collections.create("580e63e98c9a982ac9b8b741", {
    displayName: "Blog Posts",
    singularName: "Blog Post",
    slug: "posts",
    fields: [{
            isRequired: true,
            type: "PlainText",
            displayName: "Title",
            helpText: "The title of the blog post"
        }, {
            isRequired: true,
            type: "RichText",
            displayName: "Content",
            helpText: "The content of the blog post"
        }, {
            isRequired: true,
            type: "Reference",
            displayName: "Author",
            helpText: "The author of the blog post",
            metadata: {
                collectionId: "23cc2d952d4e4631ffd4345d2743db4e"
            }
        }]
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

	url := "https://api.webflow.com/v2/sites/580e63e98c9a982ac9b8b741/collections"

	payload := strings.NewReader("{\n  \"displayName\": \"Blog Posts\",\n  \"singularName\": \"Blog Post\",\n  \"slug\": \"posts\",\n  \"fields\": [\n    {\n      \"isRequired\": true,\n      \"type\": \"PlainText\",\n      \"displayName\": \"Title\",\n      \"helpText\": \"The title of the blog post\",\n      \"slug\": \"title\"\n    },\n    {\n      \"isRequired\": true,\n      \"type\": \"RichText\",\n      \"displayName\": \"Content\",\n      \"helpText\": \"The content of the blog post\",\n      \"slug\": \"content\"\n    },\n    {\n      \"isRequired\": true,\n      \"type\": \"Reference\",\n      \"displayName\": \"Author\",\n      \"helpText\": \"The author of the blog post\",\n      \"metadata\": {\n        \"collectionId\": \"23cc2d952d4e4631ffd4345d2743db4e\"\n      },\n      \"slug\": \"author\"\n    }\n  ]\n}")

	req, _ := http.NewRequest("POST", url, payload)

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

url = URI("https://api.webflow.com/v2/sites/580e63e98c9a982ac9b8b741/collections")

http = Net::HTTP.new(url.host, url.port)
http.use_ssl = true

request = Net::HTTP::Post.new(url)
request["Authorization"] = 'Bearer <token>'
request["Content-Type"] = 'application/json'
request.body = "{\n  \"displayName\": \"Blog Posts\",\n  \"singularName\": \"Blog Post\",\n  \"slug\": \"posts\",\n  \"fields\": [\n    {\n      \"isRequired\": true,\n      \"type\": \"PlainText\",\n      \"displayName\": \"Title\",\n      \"helpText\": \"The title of the blog post\",\n      \"slug\": \"title\"\n    },\n    {\n      \"isRequired\": true,\n      \"type\": \"RichText\",\n      \"displayName\": \"Content\",\n      \"helpText\": \"The content of the blog post\",\n      \"slug\": \"content\"\n    },\n    {\n      \"isRequired\": true,\n      \"type\": \"Reference\",\n      \"displayName\": \"Author\",\n      \"helpText\": \"The author of the blog post\",\n      \"metadata\": {\n        \"collectionId\": \"23cc2d952d4e4631ffd4345d2743db4e\"\n      },\n      \"slug\": \"author\"\n    }\n  ]\n}"

response = http.request(request)
puts response.read_body
```

```java
HttpResponse<String> response = Unirest.post("https://api.webflow.com/v2/sites/580e63e98c9a982ac9b8b741/collections")
  .header("Authorization", "Bearer <token>")
  .header("Content-Type", "application/json")
  .body("{\n  \"displayName\": \"Blog Posts\",\n  \"singularName\": \"Blog Post\",\n  \"slug\": \"posts\",\n  \"fields\": [\n    {\n      \"isRequired\": true,\n      \"type\": \"PlainText\",\n      \"displayName\": \"Title\",\n      \"helpText\": \"The title of the blog post\",\n      \"slug\": \"title\"\n    },\n    {\n      \"isRequired\": true,\n      \"type\": \"RichText\",\n      \"displayName\": \"Content\",\n      \"helpText\": \"The content of the blog post\",\n      \"slug\": \"content\"\n    },\n    {\n      \"isRequired\": true,\n      \"type\": \"Reference\",\n      \"displayName\": \"Author\",\n      \"helpText\": \"The author of the blog post\",\n      \"metadata\": {\n        \"collectionId\": \"23cc2d952d4e4631ffd4345d2743db4e\"\n      },\n      \"slug\": \"author\"\n    }\n  ]\n}")
  .asString();
```

```php
<?php

$client = new \GuzzleHttp\Client();

$response = $client->request('POST', 'https://api.webflow.com/v2/sites/580e63e98c9a982ac9b8b741/collections', [
  'body' => '{
  "displayName": "Blog Posts",
  "singularName": "Blog Post",
  "slug": "posts",
  "fields": [
    {
      "isRequired": true,
      "type": "PlainText",
      "displayName": "Title",
      "helpText": "The title of the blog post",
      "slug": "title"
    },
    {
      "isRequired": true,
      "type": "RichText",
      "displayName": "Content",
      "helpText": "The content of the blog post",
      "slug": "content"
    },
    {
      "isRequired": true,
      "type": "Reference",
      "displayName": "Author",
      "helpText": "The author of the blog post",
      "metadata": {
        "collectionId": "23cc2d952d4e4631ffd4345d2743db4e"
      },
      "slug": "author"
    }
  ]
}',
  'headers' => [
    'Authorization' => 'Bearer <token>',
    'Content-Type' => 'application/json',
  ],
]);

echo $response->getBody();
```

```csharp
var client = new RestClient("https://api.webflow.com/v2/sites/580e63e98c9a982ac9b8b741/collections");
var request = new RestRequest(Method.POST);
request.AddHeader("Authorization", "Bearer <token>");
request.AddHeader("Content-Type", "application/json");
request.AddParameter("application/json", "{\n  \"displayName\": \"Blog Posts\",\n  \"singularName\": \"Blog Post\",\n  \"slug\": \"posts\",\n  \"fields\": [\n    {\n      \"isRequired\": true,\n      \"type\": \"PlainText\",\n      \"displayName\": \"Title\",\n      \"helpText\": \"The title of the blog post\",\n      \"slug\": \"title\"\n    },\n    {\n      \"isRequired\": true,\n      \"type\": \"RichText\",\n      \"displayName\": \"Content\",\n      \"helpText\": \"The content of the blog post\",\n      \"slug\": \"content\"\n    },\n    {\n      \"isRequired\": true,\n      \"type\": \"Reference\",\n      \"displayName\": \"Author\",\n      \"helpText\": \"The author of the blog post\",\n      \"metadata\": {\n        \"collectionId\": \"23cc2d952d4e4631ffd4345d2743db4e\"\n      },\n      \"slug\": \"author\"\n    }\n  ]\n}", ParameterType.RequestBody);
IRestResponse response = client.Execute(request);
```

```swift
import Foundation

let headers = [
  "Authorization": "Bearer <token>",
  "Content-Type": "application/json"
]
let parameters = [
  "displayName": "Blog Posts",
  "singularName": "Blog Post",
  "slug": "posts",
  "fields": [
    [
      "isRequired": true,
      "type": "PlainText",
      "displayName": "Title",
      "helpText": "The title of the blog post",
      "slug": "title"
    ],
    [
      "isRequired": true,
      "type": "RichText",
      "displayName": "Content",
      "helpText": "The content of the blog post",
      "slug": "content"
    ],
    [
      "isRequired": true,
      "type": "Reference",
      "displayName": "Author",
      "helpText": "The author of the blog post",
      "metadata": ["collectionId": "23cc2d952d4e4631ffd4345d2743db4e"],
      "slug": "author"
    ]
  ]
] as [String : Any]

let postData = JSONSerialization.data(withJSONObject: parameters, options: [])

let request = NSMutableURLRequest(url: NSURL(string: "https://api.webflow.com/v2/sites/580e63e98c9a982ac9b8b741/collections")! as URL,
                                        cachePolicy: .useProtocolCachePolicy,
                                    timeoutInterval: 10.0)
request.httpMethod = "POST"
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
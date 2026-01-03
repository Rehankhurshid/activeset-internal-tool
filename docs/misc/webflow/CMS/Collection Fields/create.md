# Create field

POST https://api.webflow.com/v2/collections/{collection_id}/fields
Content-Type: application/json

Create a custom field in a collection.

Field validation is currently not available through the API.

Bulk creation of fields is not supported with this endpoint. To add multiple fields at once, include them when you [create the collection.](/data/v2.0.0/reference/cms/collections/create)

Required scope | `cms:write`


Reference: https://developers.webflow.com/data/reference/cms/collection-fields/create

## OpenAPI Specification

```yaml
openapi: 3.1.1
info:
  title: Create Collection Field
  version: endpoint_collections/fields.create
paths:
  /collections/{collection_id}/fields:
    post:
      operationId: create
      summary: Create Collection Field
      description: >
        Create a custom field in a collection.


        Field validation is currently not available through the API.


        Bulk creation of fields is not supported with this endpoint. To add
        multiple fields at once, include them when you [create the
        collection.](/data/v2.0.0/reference/cms/collections/create)


        Required scope | `cms:write`
      tags:
        - - subpackage_collections
          - subpackage_collections/fields
      parameters:
        - name: collection_id
          in: path
          description: Unique identifier for a Collection
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
                $ref: '#/components/schemas/collections_fields_create_Response_200'
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
        description: The field to create
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/collections_fields_create_Request'
components:
  schemas:
    CollectionsCollectionIdFieldsPostRequestBodyContentApplicationJsonSchemaOneOf0Type:
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
    CollectionsFieldsCreateRequest0:
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
            #/components/schemas/CollectionsCollectionIdFieldsPostRequestBodyContentApplicationJsonSchemaOneOf0Type
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
    CollectionsCollectionIdFieldsPostRequestBodyContentApplicationJsonSchemaOneOf1Type:
      type: string
      enum:
        - value: Option
    CollectionsCollectionIdFieldsPostRequestBodyContentApplicationJsonSchemaOneOf1MetadataOptionsItems:
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
    CollectionsCollectionIdFieldsPostRequestBodyContentApplicationJsonSchemaOneOf1Metadata:
      type: object
      properties:
        options:
          type: array
          items:
            $ref: >-
              #/components/schemas/CollectionsCollectionIdFieldsPostRequestBodyContentApplicationJsonSchemaOneOf1MetadataOptionsItems
          description: The option values for the Option field.
      required:
        - options
    CollectionsFieldsCreateRequest1:
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
            #/components/schemas/CollectionsCollectionIdFieldsPostRequestBodyContentApplicationJsonSchemaOneOf1Type
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
            #/components/schemas/CollectionsCollectionIdFieldsPostRequestBodyContentApplicationJsonSchemaOneOf1Metadata
          description: The metadata for the Option field.
      required:
        - type
        - displayName
        - metadata
    CollectionsCollectionIdFieldsPostRequestBodyContentApplicationJsonSchemaOneOf2Type:
      type: string
      enum:
        - value: MultiReference
        - value: Reference
    CollectionsCollectionIdFieldsPostRequestBodyContentApplicationJsonSchemaOneOf2Metadata:
      type: object
      properties:
        collectionId:
          type: string
          description: The unique identifier of the collection
      required:
        - collectionId
    CollectionsFieldsCreateRequest2:
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
            #/components/schemas/CollectionsCollectionIdFieldsPostRequestBodyContentApplicationJsonSchemaOneOf2Type
          description: Choose these appropriate field type for your collection data
        displayName:
          type: string
          description: The name of a field
        helpText:
          type: string
          description: Additional text to help anyone filling out this field
        metadata:
          $ref: >-
            #/components/schemas/CollectionsCollectionIdFieldsPostRequestBodyContentApplicationJsonSchemaOneOf2Metadata
          description: >-
            The collectionId for the referenced collection. Only applicable for
            Reference and MultiReference fields.
      required:
        - type
        - displayName
        - metadata
    collections_fields_create_Request:
      oneOf:
        - $ref: '#/components/schemas/CollectionsFieldsCreateRequest0'
        - $ref: '#/components/schemas/CollectionsFieldsCreateRequest1'
        - $ref: '#/components/schemas/CollectionsFieldsCreateRequest2'
    CollectionsCollectionIdFieldsPostResponsesContentApplicationJsonSchemaOneOf0Type:
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
    CollectionsFieldsCreateResponse2000:
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
            #/components/schemas/CollectionsCollectionIdFieldsPostResponsesContentApplicationJsonSchemaOneOf0Type
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
    CollectionsCollectionIdFieldsPostResponsesContentApplicationJsonSchemaOneOf1Type:
      type: string
      enum:
        - value: Option
    CollectionsCollectionIdFieldsPostResponsesContentApplicationJsonSchemaOneOf1MetadataOptionsItems:
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
    CollectionsCollectionIdFieldsPostResponsesContentApplicationJsonSchemaOneOf1Metadata:
      type: object
      properties:
        options:
          type: array
          items:
            $ref: >-
              #/components/schemas/CollectionsCollectionIdFieldsPostResponsesContentApplicationJsonSchemaOneOf1MetadataOptionsItems
          description: The option values for the Option field.
      required:
        - options
    CollectionsFieldsCreateResponse2001:
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
            #/components/schemas/CollectionsCollectionIdFieldsPostResponsesContentApplicationJsonSchemaOneOf1Type
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
            #/components/schemas/CollectionsCollectionIdFieldsPostResponsesContentApplicationJsonSchemaOneOf1Metadata
          description: The metadata for the Option field.
      required:
        - type
        - displayName
        - metadata
    CollectionsCollectionIdFieldsPostResponsesContentApplicationJsonSchemaOneOf2Type:
      type: string
      enum:
        - value: MultiReference
        - value: Reference
    CollectionsCollectionIdFieldsPostResponsesContentApplicationJsonSchemaOneOf2Metadata:
      type: object
      properties:
        collectionId:
          type: string
          description: The unique identifier of the collection
      required:
        - collectionId
    CollectionsFieldsCreateResponse2002:
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
            #/components/schemas/CollectionsCollectionIdFieldsPostResponsesContentApplicationJsonSchemaOneOf2Type
          description: Choose these appropriate field type for your collection data
        displayName:
          type: string
          description: The name of a field
        helpText:
          type: string
          description: Additional text to help anyone filling out this field
        metadata:
          $ref: >-
            #/components/schemas/CollectionsCollectionIdFieldsPostResponsesContentApplicationJsonSchemaOneOf2Metadata
          description: >-
            The collectionId for the referenced collection. Only applicable for
            Reference and MultiReference fields.
      required:
        - type
        - displayName
        - metadata
    collections_fields_create_Response_200:
      oneOf:
        - $ref: '#/components/schemas/CollectionsFieldsCreateResponse2000'
        - $ref: '#/components/schemas/CollectionsFieldsCreateResponse2001'
        - $ref: '#/components/schemas/CollectionsFieldsCreateResponse2002'

```

## SDK Code Examples

```python StaticField
from webflow import StaticField, Webflow

client = Webflow(
    access_token="YOUR_ACCESS_TOKEN",
)
client.collections.fields.create(
    collection_id="580e63fc8c9a982ac9b8b745",
    request=StaticField(
        id="562ac0395358780a1f5e6fbc",
        is_editable=True,
        is_required=False,
        type="RichText",
        display_name="Post Body",
        help_text="Add the body of your post here",
    ),
)

```

```typescript StaticField
import { WebflowClient } from "webflow-api";

const client = new WebflowClient({ accessToken: "YOUR_ACCESS_TOKEN" });
await client.collections.fields.create("580e63fc8c9a982ac9b8b745", {
    id: "562ac0395358780a1f5e6fbc",
    isEditable: true,
    isRequired: false,
    type: "RichText",
    displayName: "Post Body",
    helpText: "Add the body of your post here"
});

```

```go StaticField
package main

import (
	"fmt"
	"strings"
	"net/http"
	"io"
)

func main() {

	url := "https://api.webflow.com/v2/collections/580e63fc8c9a982ac9b8b745/fields"

	payload := strings.NewReader("{\n  \"isRequired\": false,\n  \"type\": \"RichText\",\n  \"displayName\": \"Post Body\",\n  \"helpText\": \"Add the body of your post here\",\n  \"id\": \"562ac0395358780a1f5e6fbc\",\n  \"isEditable\": true\n}")

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

```ruby StaticField
require 'uri'
require 'net/http'

url = URI("https://api.webflow.com/v2/collections/580e63fc8c9a982ac9b8b745/fields")

http = Net::HTTP.new(url.host, url.port)
http.use_ssl = true

request = Net::HTTP::Post.new(url)
request["Authorization"] = 'Bearer <token>'
request["Content-Type"] = 'application/json'
request.body = "{\n  \"isRequired\": false,\n  \"type\": \"RichText\",\n  \"displayName\": \"Post Body\",\n  \"helpText\": \"Add the body of your post here\",\n  \"id\": \"562ac0395358780a1f5e6fbc\",\n  \"isEditable\": true\n}"

response = http.request(request)
puts response.read_body
```

```java StaticField
HttpResponse<String> response = Unirest.post("https://api.webflow.com/v2/collections/580e63fc8c9a982ac9b8b745/fields")
  .header("Authorization", "Bearer <token>")
  .header("Content-Type", "application/json")
  .body("{\n  \"isRequired\": false,\n  \"type\": \"RichText\",\n  \"displayName\": \"Post Body\",\n  \"helpText\": \"Add the body of your post here\",\n  \"id\": \"562ac0395358780a1f5e6fbc\",\n  \"isEditable\": true\n}")
  .asString();
```

```php StaticField
<?php

$client = new \GuzzleHttp\Client();

$response = $client->request('POST', 'https://api.webflow.com/v2/collections/580e63fc8c9a982ac9b8b745/fields', [
  'body' => '{
  "isRequired": false,
  "type": "RichText",
  "displayName": "Post Body",
  "helpText": "Add the body of your post here",
  "id": "562ac0395358780a1f5e6fbc",
  "isEditable": true
}',
  'headers' => [
    'Authorization' => 'Bearer <token>',
    'Content-Type' => 'application/json',
  ],
]);

echo $response->getBody();
```

```csharp StaticField
var client = new RestClient("https://api.webflow.com/v2/collections/580e63fc8c9a982ac9b8b745/fields");
var request = new RestRequest(Method.POST);
request.AddHeader("Authorization", "Bearer <token>");
request.AddHeader("Content-Type", "application/json");
request.AddParameter("application/json", "{\n  \"isRequired\": false,\n  \"type\": \"RichText\",\n  \"displayName\": \"Post Body\",\n  \"helpText\": \"Add the body of your post here\",\n  \"id\": \"562ac0395358780a1f5e6fbc\",\n  \"isEditable\": true\n}", ParameterType.RequestBody);
IRestResponse response = client.Execute(request);
```

```swift StaticField
import Foundation

let headers = [
  "Authorization": "Bearer <token>",
  "Content-Type": "application/json"
]
let parameters = [
  "isRequired": false,
  "type": "RichText",
  "displayName": "Post Body",
  "helpText": "Add the body of your post here",
  "id": "562ac0395358780a1f5e6fbc",
  "isEditable": true
] as [String : Any]

let postData = JSONSerialization.data(withJSONObject: parameters, options: [])

let request = NSMutableURLRequest(url: NSURL(string: "https://api.webflow.com/v2/collections/580e63fc8c9a982ac9b8b745/fields")! as URL,
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

```python OptionField
from webflow import Metadata, MetadataOptionsItem, OptionField, Webflow

client = Webflow(
    access_token="YOUR_ACCESS_TOKEN",
)
client.collections.fields.create(
    collection_id="580e63fc8c9a982ac9b8b745",
    request=OptionField(
        id="562ac0395358780a1f5e6fbc",
        is_editable=True,
        is_required=False,
        display_name="Post Type",
        help_text="Add the body of your post here",
        metadata=Metadata(
            options=[
                MetadataOptionsItem(
                    name="Feature",
                ),
                MetadataOptionsItem(
                    name="News",
                ),
                MetadataOptionsItem(
                    name="Product Highlight",
                ),
            ],
        ),
    ),
)

```

```typescript OptionField
import { WebflowClient } from "webflow-api";

const client = new WebflowClient({ accessToken: "YOUR_ACCESS_TOKEN" });
await client.collections.fields.create("580e63fc8c9a982ac9b8b745", {
    id: "562ac0395358780a1f5e6fbc",
    isEditable: true,
    isRequired: false,
    type: "Option",
    displayName: "Post Type",
    helpText: "Add the body of your post here",
    metadata: {
        options: [{
                name: "Feature"
            }, {
                name: "News"
            }, {
                name: "Product Highlight"
            }]
    }
});

```

```go OptionField
package main

import (
	"fmt"
	"strings"
	"net/http"
	"io"
)

func main() {

	url := "https://api.webflow.com/v2/collections/580e63fc8c9a982ac9b8b745/fields"

	payload := strings.NewReader("{\n  \"isRequired\": false,\n  \"type\": \"Option\",\n  \"displayName\": \"Post Type\",\n  \"helpText\": \"Add the body of your post here\",\n  \"metadata\": {\n    \"options\": [\n      {\n        \"name\": \"Feature\"\n      },\n      {\n        \"name\": \"News\"\n      },\n      {\n        \"name\": \"Product Highlight\"\n      }\n    ]\n  },\n  \"id\": \"562ac0395358780a1f5e6fbc\",\n  \"isEditable\": true\n}")

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

```ruby OptionField
require 'uri'
require 'net/http'

url = URI("https://api.webflow.com/v2/collections/580e63fc8c9a982ac9b8b745/fields")

http = Net::HTTP.new(url.host, url.port)
http.use_ssl = true

request = Net::HTTP::Post.new(url)
request["Authorization"] = 'Bearer <token>'
request["Content-Type"] = 'application/json'
request.body = "{\n  \"isRequired\": false,\n  \"type\": \"Option\",\n  \"displayName\": \"Post Type\",\n  \"helpText\": \"Add the body of your post here\",\n  \"metadata\": {\n    \"options\": [\n      {\n        \"name\": \"Feature\"\n      },\n      {\n        \"name\": \"News\"\n      },\n      {\n        \"name\": \"Product Highlight\"\n      }\n    ]\n  },\n  \"id\": \"562ac0395358780a1f5e6fbc\",\n  \"isEditable\": true\n}"

response = http.request(request)
puts response.read_body
```

```java OptionField
HttpResponse<String> response = Unirest.post("https://api.webflow.com/v2/collections/580e63fc8c9a982ac9b8b745/fields")
  .header("Authorization", "Bearer <token>")
  .header("Content-Type", "application/json")
  .body("{\n  \"isRequired\": false,\n  \"type\": \"Option\",\n  \"displayName\": \"Post Type\",\n  \"helpText\": \"Add the body of your post here\",\n  \"metadata\": {\n    \"options\": [\n      {\n        \"name\": \"Feature\"\n      },\n      {\n        \"name\": \"News\"\n      },\n      {\n        \"name\": \"Product Highlight\"\n      }\n    ]\n  },\n  \"id\": \"562ac0395358780a1f5e6fbc\",\n  \"isEditable\": true\n}")
  .asString();
```

```php OptionField
<?php

$client = new \GuzzleHttp\Client();

$response = $client->request('POST', 'https://api.webflow.com/v2/collections/580e63fc8c9a982ac9b8b745/fields', [
  'body' => '{
  "isRequired": false,
  "type": "Option",
  "displayName": "Post Type",
  "helpText": "Add the body of your post here",
  "metadata": {
    "options": [
      {
        "name": "Feature"
      },
      {
        "name": "News"
      },
      {
        "name": "Product Highlight"
      }
    ]
  },
  "id": "562ac0395358780a1f5e6fbc",
  "isEditable": true
}',
  'headers' => [
    'Authorization' => 'Bearer <token>',
    'Content-Type' => 'application/json',
  ],
]);

echo $response->getBody();
```

```csharp OptionField
var client = new RestClient("https://api.webflow.com/v2/collections/580e63fc8c9a982ac9b8b745/fields");
var request = new RestRequest(Method.POST);
request.AddHeader("Authorization", "Bearer <token>");
request.AddHeader("Content-Type", "application/json");
request.AddParameter("application/json", "{\n  \"isRequired\": false,\n  \"type\": \"Option\",\n  \"displayName\": \"Post Type\",\n  \"helpText\": \"Add the body of your post here\",\n  \"metadata\": {\n    \"options\": [\n      {\n        \"name\": \"Feature\"\n      },\n      {\n        \"name\": \"News\"\n      },\n      {\n        \"name\": \"Product Highlight\"\n      }\n    ]\n  },\n  \"id\": \"562ac0395358780a1f5e6fbc\",\n  \"isEditable\": true\n}", ParameterType.RequestBody);
IRestResponse response = client.Execute(request);
```

```swift OptionField
import Foundation

let headers = [
  "Authorization": "Bearer <token>",
  "Content-Type": "application/json"
]
let parameters = [
  "isRequired": false,
  "type": "Option",
  "displayName": "Post Type",
  "helpText": "Add the body of your post here",
  "metadata": ["options": [["name": "Feature"], ["name": "News"], ["name": "Product Highlight"]]],
  "id": "562ac0395358780a1f5e6fbc",
  "isEditable": true
] as [String : Any]

let postData = JSONSerialization.data(withJSONObject: parameters, options: [])

let request = NSMutableURLRequest(url: NSURL(string: "https://api.webflow.com/v2/collections/580e63fc8c9a982ac9b8b745/fields")! as URL,
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

```python ReferenceField
from webflow import ReferenceField, ReferenceFieldMetadata, Webflow

client = Webflow(
    access_token="YOUR_ACCESS_TOKEN",
)
client.collections.fields.create(
    collection_id="580e63fc8c9a982ac9b8b745",
    request=ReferenceField(
        id="562ac0395358780a1f5e6fbd",
        is_editable=True,
        is_required=False,
        type="Reference",
        display_name="Author",
        help_text="Add the post author here",
        metadata=ReferenceFieldMetadata(
            collection_id="63692ab61fb2852f582ba8f5",
        ),
    ),
)

```

```typescript ReferenceField
import { WebflowClient } from "webflow-api";

const client = new WebflowClient({ accessToken: "YOUR_ACCESS_TOKEN" });
await client.collections.fields.create("580e63fc8c9a982ac9b8b745", {
    id: "562ac0395358780a1f5e6fbd",
    isEditable: true,
    isRequired: false,
    type: "Reference",
    displayName: "Author",
    helpText: "Add the post author here",
    metadata: {
        collectionId: "63692ab61fb2852f582ba8f5"
    }
});

```

```go ReferenceField
package main

import (
	"fmt"
	"strings"
	"net/http"
	"io"
)

func main() {

	url := "https://api.webflow.com/v2/collections/580e63fc8c9a982ac9b8b745/fields"

	payload := strings.NewReader("{\n  \"isRequired\": false,\n  \"type\": \"Reference\",\n  \"displayName\": \"Author\",\n  \"helpText\": \"Add the post author here\",\n  \"metadata\": {\n    \"collectionId\": \"63692ab61fb2852f582ba8f5\"\n  },\n  \"id\": \"562ac0395358780a1f5e6fbd\",\n  \"isEditable\": true\n}")

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

```ruby ReferenceField
require 'uri'
require 'net/http'

url = URI("https://api.webflow.com/v2/collections/580e63fc8c9a982ac9b8b745/fields")

http = Net::HTTP.new(url.host, url.port)
http.use_ssl = true

request = Net::HTTP::Post.new(url)
request["Authorization"] = 'Bearer <token>'
request["Content-Type"] = 'application/json'
request.body = "{\n  \"isRequired\": false,\n  \"type\": \"Reference\",\n  \"displayName\": \"Author\",\n  \"helpText\": \"Add the post author here\",\n  \"metadata\": {\n    \"collectionId\": \"63692ab61fb2852f582ba8f5\"\n  },\n  \"id\": \"562ac0395358780a1f5e6fbd\",\n  \"isEditable\": true\n}"

response = http.request(request)
puts response.read_body
```

```java ReferenceField
HttpResponse<String> response = Unirest.post("https://api.webflow.com/v2/collections/580e63fc8c9a982ac9b8b745/fields")
  .header("Authorization", "Bearer <token>")
  .header("Content-Type", "application/json")
  .body("{\n  \"isRequired\": false,\n  \"type\": \"Reference\",\n  \"displayName\": \"Author\",\n  \"helpText\": \"Add the post author here\",\n  \"metadata\": {\n    \"collectionId\": \"63692ab61fb2852f582ba8f5\"\n  },\n  \"id\": \"562ac0395358780a1f5e6fbd\",\n  \"isEditable\": true\n}")
  .asString();
```

```php ReferenceField
<?php

$client = new \GuzzleHttp\Client();

$response = $client->request('POST', 'https://api.webflow.com/v2/collections/580e63fc8c9a982ac9b8b745/fields', [
  'body' => '{
  "isRequired": false,
  "type": "Reference",
  "displayName": "Author",
  "helpText": "Add the post author here",
  "metadata": {
    "collectionId": "63692ab61fb2852f582ba8f5"
  },
  "id": "562ac0395358780a1f5e6fbd",
  "isEditable": true
}',
  'headers' => [
    'Authorization' => 'Bearer <token>',
    'Content-Type' => 'application/json',
  ],
]);

echo $response->getBody();
```

```csharp ReferenceField
var client = new RestClient("https://api.webflow.com/v2/collections/580e63fc8c9a982ac9b8b745/fields");
var request = new RestRequest(Method.POST);
request.AddHeader("Authorization", "Bearer <token>");
request.AddHeader("Content-Type", "application/json");
request.AddParameter("application/json", "{\n  \"isRequired\": false,\n  \"type\": \"Reference\",\n  \"displayName\": \"Author\",\n  \"helpText\": \"Add the post author here\",\n  \"metadata\": {\n    \"collectionId\": \"63692ab61fb2852f582ba8f5\"\n  },\n  \"id\": \"562ac0395358780a1f5e6fbd\",\n  \"isEditable\": true\n}", ParameterType.RequestBody);
IRestResponse response = client.Execute(request);
```

```swift ReferenceField
import Foundation

let headers = [
  "Authorization": "Bearer <token>",
  "Content-Type": "application/json"
]
let parameters = [
  "isRequired": false,
  "type": "Reference",
  "displayName": "Author",
  "helpText": "Add the post author here",
  "metadata": ["collectionId": "63692ab61fb2852f582ba8f5"],
  "id": "562ac0395358780a1f5e6fbd",
  "isEditable": true
] as [String : Any]

let postData = JSONSerialization.data(withJSONObject: parameters, options: [])

let request = NSMutableURLRequest(url: NSURL(string: "https://api.webflow.com/v2/collections/580e63fc8c9a982ac9b8b745/fields")! as URL,
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
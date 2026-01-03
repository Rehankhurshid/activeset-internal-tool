# Field Types & Item Values

> A reference for all Webflow CMS field types and the value formats they accept.

This page is a reference for all Webflow CMS field types and the value formats they accept. Use it to:

* Understand each field type’s purpose and behavior
* Learn how to format values when creating or updating items via the API

To retrieve the specific fields used in a collection, call the [Get Collection](/data/reference/cms/collections/get) endpoint.

<Note title="Field Type Names">
  Some field types may use slightly different names in the Webflow UI. This document uses the API name for each field type.
</Note>

## [Plain Text](https://university.webflow.com/lesson/plain-text-field)

Stores text without formatting.

<Tabs>
  <Tab title="Value Format">
    ```
    string
    ```
  </Tab>

  <Tab title="Example">
    ```
    "Always know where your towel is."
    ```
  </Tab>
</Tabs>

## [Rich Text](https://university.webflow.com/lesson/rich-text-field)

Stores long-form text with HTML formatting.

<Tabs>
  <Tab title="Value Format">
    ```
    string
    ```
  </Tab>

  <Tab title="Example">
    ```html
    "<p>A small, blue-green planet orbiting an unregarded yellow sun in the uncharted backwaters of the Galaxy's western spiral arm.</p>
    <h3>Notable features</h3>
    <blockquote>It has a population of humans, who are mostly harmless. They have developed digital watches and are known for their ability to make tea.</blockquote>"
    ```
  </Tab>
</Tabs>

<Warning title="Code Blocks in Rich Text Fields">
  The API doesn't currently support code blocks in Rich Text fields. Passing code blocks will result in an empty string.
</Warning>

## [ImageRef / Image](https://university.webflow.com/lesson/image-field)

Stores a single image. Images must be hosted on a publicly accessible URL to be uploaded via the API. The maximum file size for images is 4MB.

{/* <!-- vale off --> */}

<Tabs>
  <Tab title="Read Value">
    <CodeBlocks>
      ```javascript Format
      {
        "fileId": "string",
        "url": "string",
        "alt": "string" (optional)
      }
      ```

      ```javascript Example
      {
        "fileId": "6390ba25bfe63b0cca1dd136",
        "url": "https://.../image.jpg",
        "alt": "Marvin the Paranoid Android"
      }
      ```
    </CodeBlocks>
  </Tab>

  <Tab title="Write Value">
    To upload a new image, provide an object containing a `url`.

    <CodeBlocks>
      ```javascript title="New Upload"
      {
        "myImageField": {
          "url": "https://.../image.png",
          "alt": "Finn and Jake fist bumping"
        }
      }
      ```
    </CodeBlocks>
  </Tab>
</Tabs>

{/* <!-- vale on --> */}

## [Multi-Image](https://university.webflow.com/lesson/multi-image-field-overview)

Stores multiple images. Images must be hosted on a publicly accessible URL to be uploaded via the API. The maximum file size for each image is 4MB.

{/* <!-- vale off --> */}

<Tabs>
  <Tab title="Read Value">
    <CodeBlocks>
      ```javascript Format
      [
        {
          "fileId": "string",
          "url": "string",
          "alt": "string" (optional)
        }
      ]
      ```

      ```json Example
      {
        "myImageField": [
          {
            "fileId": "6390ba25bfe63b0cca1dd136",
            "url": "https://.../image1.jpeg",
            "alt": "Marvin the Paranoid Android"
          },
          {
            "fileId": "6390ba25bfe63b0cca1dd137",
            "url": "https://.../image2.jpeg",
            "alt": "Vogon Poetry"
          }
        ]
      }
      ```
    </CodeBlocks>
  </Tab>

  <Tab title="Write Value">
    To upload new images, provide an array of objects, each containing a `url`.

    <CodeBlocks>
      ```javascript title="New Uploads"
      {
        "myImageField": [
          {
            "url": "https://.../image1.png",
            "alt": "Finn and Jake fist bumping"
          },
          {
            "url": "https://.../image2.png",
            "alt": "Finn and Jake hugging"
          }
        ]
      }
      ```
    </CodeBlocks>
  </Tab>
</Tabs>

{/* <!-- vale on --> */}

## VideoLink

Accepts a URL string for videos hosted on platforms like YouTube or Vimeo.

{/* <!-- vale off --> */}

<Tabs>
  <Tab title="Value Format">
    ```
    string
    ```
  </Tab>

  <Tab title="Example">
    ```json
    {
      "myVideoLink": "https://www.youtube.com/watch?v=jfKfPfyJRdk"
    }
    ```
  </Tab>
</Tabs>

## [Link](https://university.webflow.com/lesson/link-field)

Stores a URL.

<Tabs>
  <Tab title="Value Format">
    ```
    string
    ```
  </Tab>

  <Tab title="Example">
    ```json
    {
      "myLink": "https://www.webflow.com"
    }
    ```
  </Tab>
</Tabs>

{/* <!-- vale on --> */}

## [Email](https://university.webflow.com/lesson/email-field)

Stores an email address.

{/* <!-- vale off --> */}

<Tabs>
  <Tab title="Value Format">
    ```
    string
    ```
  </Tab>

  <Tab title="Example">
    ```json
    {
      "myEmail": "hello@webflow.com"
    }
    ```
  </Tab>
</Tabs>

## [Phone](https://university.webflow.com/lesson/phone-field)

Stores a phone number.

<Tabs>
  <Tab title="Value Format">
    ```
    string
    ```
  </Tab>

  <Tab title="Example">
    ```json
    {
      "myPhone": "2024561111"
    }
    ```
  </Tab>
</Tabs>

{/* <!-- vale on --> */}

## [Number](https://university.webflow.com/lesson/number-field)

Stores an integer or a decimal number.

{/* <!-- vale off --> */}

<Tabs>
  <Tab title="Value Format">
    ```
    number
    ```
  </Tab>

  <Tab title="Example">
    ```json
    {
      "myNumber": 42
    }
    ```
  </Tab>
</Tabs>

## [Date/Time](https://university.webflow.com/lesson/date-time-field)

Stores a date and time.

<Tabs>
  <Tab title="Read Value Format">
    ```
    string (ISO 8601)
    ```
  </Tab>

  <Tab title="Write Value Format">
    ```
    Date | string (ISO 8601)
    ```
  </Tab>

  <Tab title="Example">
    ```json
    {
      "myDateTime": "2022-11-18T00:00:00.000Z"
    }
    ```
  </Tab>
</Tabs>

{/* <!-- vale on --> */}

## [Switch](https://university.webflow.com/lesson/switch-field)

Stores a boolean value (`true` or `false`).

{/* <!-- vale off --> */}

<Tabs>
  <Tab title="Value Format">
    ```
    boolean
    ```
  </Tab>

  <Tab title="Example">
    ```json
    {
      "mostly-harmless": true
    }
    ```
  </Tab>
</Tabs>

{/* <!-- vale on --> */}

## [Color](https://university.webflow.com/lesson/color-field-overview)

Stores a color value. Accepts HEX, RGB, HSL, and named color formats.

{/* <!-- vale off --> */}

<Tabs>
  <Tab title="Value Format">
    ```
    string
    ```
  </Tab>

  <Tab title="Example">
    ```json
    {
      "bulldozer": "#FFFF00"
    }
    ```
  </Tab>
</Tabs>

{/* <!-- vale on --> */}

Accepted formats include:

* `#RGB`
* `#RGBA`
* `#RRGGBB`
* `#RRGGBBAA`
* `rgb(red,green,blue)`
* `rgba(red,green,blue,alpha)`
* `hsl(hue,saturation,lightness)`
* `hsla(hue,saturation,lightness,alpha)`
* `orchid`, `aqua`, `black`, etc.
* `transparent`

## [Option](https://university.webflow.com/lesson/option-field)

Creates a predefined list of choices for an item.

### Create an Option Field

To create an Option field, send a `POST` request to the [Create Field](/data/reference/cms/collection-fields/create) endpoint. The request body must include `"type": "Option"` and a `metadata` object containing an `options` array. Each object in the array defines a choice with a `name`.

{/* <!-- vale off --> */}

<Tabs>
  <Tab title="Create Field Request">
    ```javascript
    {
      "type": "Option",
      "displayName": "milliways-drink-menu",
      "metadata": {
        "options": [
          {"name": "pan-galactic gargle blaster"},
          {"name": "waturi punch"},
          {"name": "gnab gib"}
        ]
      }
    }
    ```
  </Tab>

  <Tab title="Read Field Definition">
    ```javascript
    {
      "type": "Option",
      "validations": {
        "options": [
          {
            "name": "pan-galactic gargle blaster",
            "id": "a1b2c3d4"
          },
          // ...
        ]
      }
    }
    ```
  </Tab>
</Tabs>

{/* <!-- vale on --> */}

### Write an option value

To set an option for an item, get the option `id` of the desired option and pass it as a string. You can get the option `id` by calling the [Get Collection Details](/data/reference/cms/collections/get) endpoint and then searching for the option field and it's metadata in the `fields` array.

<Tabs>
  <Tab title="Value Format">
    ```
    string (Option ID)
    ```
  </Tab>

  <Tab title="Example">
    ```json
    {
      "milliways-drink-menu": "a1b2c3d4"
    }
    ```
  </Tab>
</Tabs>

## File

Stores a file reference. You can upload a new file from a public URL or use an existing file by referencing its `fileId`.

{/* <!-- vale off --> */}

<Tabs>
  <Tab title="Read Value">
    ```javascript
    {
      "fileId": "string",
      "url": "string",
      "alt"?: "string"
    }
    ```
  </Tab>

  <Tab title="Write Value">
    ```javascript
    {
      "url": "https://data.wa.gov/api/views/f6w7-q2d2/rows.csv"
      alt"?: "Electric Vehicle Data"
    }
    ```
  </Tab>
</Tabs>

{/* <!-- vale on --> */}

## [ItemRef / Reference](https://university.webflow.com/lesson/reference-field)

Links an item to another item in the same or a different collection.

### Create a reference field

To create a Reference field, send a `POST` request to the [Create Field](/data/reference/cms/collection-fields/create) endpoint. The request body must include `"type": "Reference"` and a `metadata` object containing the `collectionId` of the collection you want to reference.

{/* <!-- vale off --> */}

<Tabs>
  <Tab title="Create Field Request">
    ```javascript
    // Include the metadata property in the request body
    {
      "type": "Reference",
      "displayName": "Author",
      "helpText": "Add the post author here",
      "metadata": {
        "collectionId": "63692ab61fb2852f582ba8f5"
      }
    }
    ```
  </Tab>
</Tabs>

{/* <!-- vale on --> */}

### Write a reference value

To set a reference for an item, get the item `id` of the referenced item and pass it as a string. You can get the item `id` by calling the [Get Items](/data/reference/cms/collection-items/staged-items/list-items) endpoint for the referenced collection.

<Tabs>
  <Tab title="Value Format">
    ```
    string (Item ID)
    ```
  </Tab>

  <Tab title="Example">
    ```json
    {
      "author": "63764ec7981aa0138e99abc"
    }
    ```
  </Tab>
</Tabs>

## [Multi-Reference](https://university.webflow.com/lesson/multi-reference-field)

Links an item to multiple items in the same or a different collection.

### Create a multi-reference field

To create a Multi-Reference field, send a `POST` request to the [Create Field](/data/reference/cms/collection-fields/create) endpoint. The request body must include `"type": "MultiReference"` and a `metadata` object containing the `collectionId` of the collection you want to reference.

{/* <!-- vale off --> */}

<Tabs>
  <Tab title="Create Field Request">
    ```javascript
    // Include the metadata property in the request body
    {
      "type": "MultiReference",
      "displayName": "Authors",
      "helpText": "Add post authors here",
      "metadata": {
        "collectionId": "63692ab61fb2852f582ba8f5"
      }
    }
    ```
  </Tab>
</Tabs>

{/* <!-- vale on --> */}

### Write a multi-reference value

To set multiple references for an item, pass an array of item `id` strings.

<Tabs>
  <Tab title="Value Format">
    ```
    [string, string] (Item IDs)
    ```
  </Tab>

  <Tab title="Example">
    ```json
    {
      "authors": [
        "63764ec7981aa0138e99abc",
        "63764ec7981aa0138e99abd"
      ]
    }
    ```
  </Tab>
</Tabs>

## User

A read-only field containing the unique ID of a Webflow user. This field is used for the "created-by" and "updated-by" properties on an item.

{/* <!-- vale off --> */}

<Tabs>
  <Tab title="Value Format">
    ```
    string
    ```
  </Tab>

  <Tab title="Example">
    ```
    "Person_63209baeac0b804b455624ce"
    ```
  </Tab>
</Tabs>

{/* <!-- vale on --> */}

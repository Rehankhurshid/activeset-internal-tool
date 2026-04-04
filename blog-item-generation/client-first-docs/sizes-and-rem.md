---
source: https://finsweet.com/client-first/docs/sizes-and-rem
fetched: 2026-04-01
title: "Sizes and rem"
---

# Sizes and rem

## Rem

Webflow defaults to **px** units. If we type "**10**" into any Designer input and press "Enter", it will set "**10px**".

Client-First uses **rem**, which we can select in the unit dropdown.

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/659af7a026c74fabe4172e4e_introsize-and-rem.webp)

### What is rem?

Rem stands for "root em".

- Rem is a relative unit of measurement based on the root element's font-size.
- The root element is html.
- Rem is relative to the html font size.
- Most sizes applied in Client-First are in **rem**.

### Inheriting browser font size

In Client-First we inherit the html font-size from the browser.

Browsers initially use **16px** as their default html font-size.

**1rem** = **16px** conversion is the browser default.

Based on Client-First approved sizes, we can make quick **px** conversions to **rem**. For example, Client-First approved **rem** values are **0.5**, **1**, **1.5**, **2**, **2.5**, **3**, and so on.

**Rem** and Client-First are a powerful couple for following best accessibility practices with browser font size.

### The math

Every **16px** is **1rem** when the browser's font-size is set to "default" in browser settings.

When we build our Webflow project, we always use **16px** as our base value for calculating **rem**.

Every rem measurement conversion is a multiple of **16**.

To convert **px** value into **rem** divide this value by **16**.

##### 64px / 16px = 4rem

To convert **rem** value into**px** multiply this value by **16**.

##### 2rem x 16px = 32px

For convenience, we suggest using easily readable **rem** values like **1**, **2**, **2.5**, **3**, **4**, **5**.

We want to avoid consistent usage of long number values like **8.4375rem**. These values are more difficult to remember and will slow us down in our workflow.

#### Calculations in Webflow Designer

Inside most unit inputs of Webflow Designer, we can calculate **rem** natively in Webflow.

Inside the width input of Designer, type "**100/16rem**", press "Enter", and see the **rem** value calculated.

We can divide any number by **16** to get its **rem** value inside Webflow Designer.

  
  
  
  Sorry, your browser doesn't support embedded videos.

### Accessibility benefits

#### Browser font size settings

Browsers use **16px** as their default html font size — and browsers allow the user to update the default font size. Users can update their preferences and change the font size settings.

Browser font size settings are an essential accessibility topic. When users update their browser font, the website content should adjust with the change. Client-First rem system adapts to the user's browser font size settings.

  
  
  
  Sorry, your browser doesn't support embedded videos.

‍

When we work in other unit measurements, like **px** and **vw**, we ignore the user's preferences to update their browser font size settings.

  
  
  
  Sorry, your browser doesn't support embedded videos.

#### Browser zoom

**Rem** also respects a user's browser zoom controls. When a user zooms in or out on the page, our layout and content in **rem** will zoom together with the user.

  
  
  
  Sorry, your browser doesn't support embedded videos.

When we use **vw** or **vh** units, browser zoom will not work.

‍**vw** relies on browser viewport width (or height in the case of **vh**). Only a change in the browser window will affect sizes set in those units.

  
  
  
  Sorry, your browser doesn't support embedded videos.

##### Client-First follows best accessibility practices. The decision to work in rem is directly related to this accessibility and UX benefit.

Learn more about accessibility using **rem** in our [Wizardry vs. Client-First comparison](https://finsweet.com/client-first/wizardry-comparison) article. This is a technical overview of the benefits of **rem** as an accessible measurement unit.

### Recommended px to rem values

Below is a list of all recommended **rem** values with their converted **px** measurement.

These Client-First approved values are a recommendation and not a strict requirement.

This list of sizes is interactive. Update values through the sticky navigation menu.

pxrem

Thank you! Your submission has been received!

Oops! Something went wrong while submitting the form.

Reset

HTML font size

px

Thank you! Your submission has been received!

Oops! Something went wrong while submitting the form.

px values

rem values

2px

=

0.125rem

#### Closest to Client-First values

2px

=

0.125rem

#### Neighboring values

2px

=

0.125rem

Client-First suggests working with these values.

There are 3 exceptions to using the above values.**‍**

#### 1. Typography

Using **14px** for font-size is common and recommended when **16px** is too large. **12px** font-size is often too small for typography.**‍**

##### 14px = 0.875rem

#### 2. 2px spacing

Use **2px** for tiny spacing. If a spacing value less than **4px** is needed, use **2px**.**‍**

##### 2px = 0.125rem

#### 3. 1px is 1px

When using **1px**, for example as a CSS border, use **1px** as the value.

We do not recommend converting **1px** values to **rem**.

Retina devices have different scaling rules than non-retina devices. Using **1px** will create exactly **1px** line on any device without retina scaling interference.**‍**

##### 1px = 1px

### Finsweet Extension px to rem migration tool

[Finsweet Extension](https://www.finsweet.com/extension) offers a tool to convert projects created in **px** to **rem**.

It will convert every value in the project from **px** to its computed **rem** value.

Inside the Client-First tab of Finsweet Extension, the "**PX to REM Migrator**" candy will manage the size unit migration.

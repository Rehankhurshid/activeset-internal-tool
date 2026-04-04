---
source: https://finsweet.com/client-first/docs/variables
fetched: 2026-04-01
title: "Variables"
---

# Variables

### Disclaimer

##### ⚠️ We decided to not release size variables because there is no breakpoint feature on the variables panel.When Webflow releases breakpoints, we will revisit the variables panel. For now, we're starting with the clear benefit of variables — Colors.

## What are the benefits of using color variables in your website?

### Consistency across the project

Color variables help unify colors throughout a project. By defining a color once and using it in multiple places, we maintain a consistent look and feel, which is crucial for brand identity and user experience.

When we need to choose a color, color variables give us a list of available options to choose from.

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/658326525c14d50b41592be5_screenshot.png)

‍

### Ease of maintenance

If we need to change a color, we only have to update it in one place — The Variables panel. Updating a color variable will change that color everywhere in the project. This makes maintenance and updates much more straightforward. It also reduces errors.

In case we need to update the brand color across the entire project, this can be quickly accomplished by adjusting the value of the primitive tokens:

  
  
  
  Sorry, your browser doesn't support embedded videos.

‍

‍

By using variables, we can also quickly update colors in different custom components and utility classes at the same time:

  
  
  
  Sorry, your browser doesn't support embedded videos.

‍

### Theming*

*This is a starting point for future releases of Webflow Variables.

Using color variables will simplify the creation of different themes, including dark/light modes when Webflow releases modes. By changing the set of color variables, we can easily switch between themes, allowing for more dynamic and customizable designs.

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/65834382a5aa7ce4474d5fed_variable-modes.png)

‍

### Improved readability and organization

Using color variables makes our Webflow project more readable and organized. It's much easier to understand and remember a color variable like --primary-color than to remember specific color codes like #FF5733.

‍

### Context for usage

Organized semantic tokens help us understand which color to use during the building process. The name of the variables gives us a lot of information about **how** it's used in the project.

If we need to add a text color to a heading, we can quickly find the project's text colors in the 'Text Color' variables section.

  
  
  
  Sorry, your browser doesn't support embedded videos.

## Primitive tokens

Primitive tokens, represented by base colors, are the foundational building blocks of a design system's color palette. These variables are the most granular level of color classification. They serve as the base for more complex and specific design decisions.

They are identified by the prefix **- Base Color:**

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/65835068664720bce65f4665_primitive-tokens.png)

‍**‍**

### How to use primitives

In practical terms, these variables are used to create the semantic variables that will be implemented in our project.

  
  
  
  Sorry, your browser doesn't support embedded videos.

##### ⚠️  Avoid directly linking primitive colors to classes unless there is a strong reason to do so.

‍

It’s only recommended to link a style directly with a primitive if you don't plan to use that primitive anywhere else.

  
  
  
  Sorry, your browser doesn't support embedded videos.

‍

### How to group the primitives

In the Client-First cloneable, we start with the following groups for the primitives:

- Brand colors
- Neutral colors
- System colors

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/65847fda01b6aa3bb527f409_cloneable-grouping.png)

‍

Every project is different. Client-First offers flexibility in grouping, allowing you to rename and regroup the variables based on the project. In the example below, find additional examples of how to group primitives.

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/658420cd00b22da5769d2f00_primitive-grouping.png)

‍

### How to name the primitives

The way designers or companies name primitives can vary significantly. We have chosen to begin our style guide with the names of the colors, accompanied by a small number of shades, as shown below:

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/658421a4d47361ebec62f2f3_client-first-primitives.png)

‍

If this does not fit well with your project, here are some additional examples of how you can name your primitive tokens:

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/65835c124f3b776edd8c41d3_primitive-naming.png)

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/65835d81ccb16c13c98faca6_primitive-naming-large-1.png)

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/65835de6dc859bfdaa52a83a_primitive-naming-large-2.png)

## Semantic tokens

Semantic tokens are variables where the names describes the purpose or meaning of the color within the design rather than describing the color itself. Reading the name of a semantic token will give us a clear understanding of what that token is used for.

In Client-First, all variables that do not contain the prefix **- Base Color**, are semantic tokens.

### How to use semantic tokens

The semantic tokens are the color variables that we use to style the elements of our website according to its use.

In the examples below, we can see specific use cases where these tokens should be used.

For background color, use the Background Color semantic tokens:

  
  
  
  Sorry, your browser doesn't support embedded videos.

‍

For text color, use the Text Color semantic tokens:

  
  
  
  Sorry, your browser doesn't support embedded videos.

‍

For border color, use the Border Color semantic tokens:

  
  
  
  Sorry, your browser doesn't support embedded videos.

‍

‍

#### Use semantic tokens as utility classes

Every semantic token created in the project can be used as a utility class if desired. This approach allows for quick changes to certain elements. In our style guide, we begin with the following utility classes linked to the semantic tokens:

- ‍*background-color-primary* linked with var(background-color--background-primary
- *background-color-secondary* linked with var(background-color--background-secondary)‍
- *background-color-tertiary* linked with var(background-color--background-tertiary)‍
- *background-color-alternate* linked with var(background-color--background-alternate)‍
- *text-color-primary* linked with var(text-color--text-primary)
- *text-color-secondary* linked with var(text-color--text-secondary)‍
- *text-color-alternate* linked with var(text--text-alternate)

‍

#### If possible, avoid linking a text element base tag directly to the semantic variable

When we apply a color directly to a text element, we lose the ability to inherit the color from the parent element. This approach is very common when developers want to quickly change the color of all child elements at once.

  
  
  
  Sorry, your browser doesn't support embedded videos.

‍

If we need to link a semantic token to a text element, Client-First includes a *inherit-color* utility class to override the style and inherit from the parent element. See the example below:

  
  
  
  Sorry, your browser doesn't support embedded videos.

‍

### How to name semantic tokens

We suggest naming the semantic tokens with the following naming convention:

#### ‍[element] - [style] - [identifier]

background - color - dark

text - color - primary

border - color - brand

#### Questions to ask ourselves when naming semantic tokens

- **Element:**What is it being added to?
- **Style:** What is the value/style that is changing?
- **Identifier:** What is a identifier for this variable?‍

Below, you can see a list of semantic token examples that you can use in your project:

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/65847b6264eb269b53790ec9_semantic-backgrounds.png)

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/65847d3c11be89bf77afc22a_semantic-texts.png)

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/65847f2b9f9db6b72d4cbb96_semantic-borders.png)

Similar to primitive tokens, designers and companies have different approaches for naming. Choose names and conventions that are most clear for the project.

‍

#### Do not name a semantic variable with the name of the color

If we name a variable simply by its color, any change in color schemes or themes would require renaming the token. This defeats the purpose of semantic tokens, which is to abstract the design from specific color values. This allows us to manage theming and global changes without renaming variables.

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/6584527ad42229edfb2f4b7d_semantic-color.png)

#### The naming convention is important for theming in the future

The names of the variables should be generic enough to accommodate different values for themes, such as light or dark mode. In the example below, see how it should look:

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/658453a6df37fcb376953566_semantic-token-right.png)

‍

If the name of the color is included in the variable, the naming convention will not be compatible with the other color names used in different modes:

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/658453d726ba8bc52ac25f60_semantic-token-wrong.png)

‍

#### Primary and alternate concept

When naming variables, consider setting the default 'theme' of your website as a reference point.

For instance, if the background primary variable represents the color black, you could use background alternate to represent the color white, the inverse of black.

This approach can also be applied to Text Color variables. For example, text primary might represent the color white while text alternate might represent the color black, offering a clear contrast for use on white backgrounds.

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/6584774969d5777638a739e7_alternate-concept.png)

## FAQ

### [fs-toc-omit]Should I follow my client's color system and naming conventions?

Absolutely. If your client has an established style guide, it's best to adhere to their color system and naming conventions. This ensures consistency and aligns with their established branding standards.

### [fs-toc-omit]What if the design file is a mess and there is no organized color system?

This is likely to happen frequently. Some designers or clients may not structure their colors well, and it becomes our job to organize them for a more structured project. To understand how to do this, check the sections **How to Name the primitives** and **How to Name the Semantic tokens** above.

### [fs-toc-omit]Can I just use the color name for a semantic variable?

This is not recommended. If you name a variable simply by its color, any change in color schemes or themes would require renaming the token. The whole point of semantic tokens is to keep things flexible and easy to update. So, it's better to go with names that describe the variable's role, not just its color.

### [fs-toc-omit]How can I know which variables are the primitives?

Primitive tokens are identified by the prefix **- Base Color.**

### [fs-toc-omit]How can I link variables with utility classes?

You can create utility classes that are linked to color variables. To do this, always use semantic tokens to maintain consistency, and be sure to use clear naming conventions that clearly describe the purpose of each color.

‍

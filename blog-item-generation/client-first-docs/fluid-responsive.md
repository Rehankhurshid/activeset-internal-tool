---
source: https://finsweet.com/client-first/docs/fluid-responsive
fetched: 2026-04-01
title: "Fluid responsive"
---

# Fluid responsive

## Tools

#### Two options for making our Client-First Webflow site fluid response

- The visual CSS snippet configurator on this page
- The same visual configurator in [Finsweet Extension](https://www.finsweet.com/extension/)

## What is fluid responsive?

As the browser viewport changes size, the design scales with it.

### Client-First fluid responsive compared to vw and vh scaling

As the browser viewport changes size, the design scales with it.

Using **vw** or **vh** units is one way to make our content fluid responsive when scaling. The problems with this method are:

- We must set **vw** or **vh** unit sizes on every element we want to be fluid responsive.
- Elements can quickly become too small or too large because of linear scaling. **vw** and **vh** scale linearly.
- Accessibility suffers because browser zooming cannot affect both **vw** and **vh** units.
- It can be challenging to manage and maintain our Webflow project in **vw** and **vh**, especially for other developers and clients.

Client-First uses "root-font scaling" instead.

### Root-font scaling

Client-First system uses **rem** units for all sizes. The **rem** unit is based on one thing — **HTML root font size**.

![](https://cdn.prod.website-files.com/65735ae231ce6f85dc671354/659b80950e31c608e6b43be4_root-font-scaling.webp)

Everything in our project is relative to the HTML****font size. Because of this, we have global-managed control over all sizes in our project.

By modifying this size, we are effectively making our **rems** "larger" or "smaller" visually. Our visual fluid responsive generator runs on an extensive set of calculations that modify root font size according to our preferences.

Adding the generated CSS code makes our Webflow project follow custom size scaling rules. Changing the HTML font size across breakpoints gives us ultimate customization of our fluid responsive scaling.

Benefits:

- Use Client-First like you usually use it. There is no specific workflow change for fluid responsive sites vs. non-fluid responsive sites.
- The fluid responsive strategy is an optional add-on. Add it, or don't add it, to any project.
- Fluid responsive can be added at the end of the project after everything is developed.
- Browsers can zoom normally.
- Browser font size settings that are modified by end-users will be respected.
- Maintaining a Webflow project in **rem** is easier than a project with fixed **vw** or **vh** based sizing.

## Visually build fluid responsiveness

  

    
  

  

    

      Video is blocked. Accept cookies to watch it.
    

  

- Visually configure the fluid responsive scaling rules.
- Copy the CSS code to the Client-First Webflow project.
- Enjoy a fluid responsive site in rems.

### Fluid responsive generator‍

## Live stream explanation

#### Learn it Live #5

Explanation of fluid responsive generator tool.

  

    
  

  

    

      Video is blocked. Accept cookies to watch it.
    

  

#### Learn it Live #8

Implementing fluid responsive generator tool on PS5 website build.

  

    
  

  

    

      Video is blocked. Accept cookies to watch it.

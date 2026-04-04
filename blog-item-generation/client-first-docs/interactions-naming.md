---
source: https://finsweet.com/client-first/docs/interactions-naming
fetched: 2026-04-01
title: "Interactions naming"
---

# Interactions naming

## Naming convention

This page explains how we can approach naming Webflow Interactions to stay organized in our project.

### Element [Action + State]

**Element** is the section/div/button/etc. that we apply the interaction to.

**Action** describes the interaction. Add **State** if valuable for context.

For example,

- Element = **Sort Button Arrow**
- Action = **Rotate**
- State = **Open**

Full interaction name:

**Sort Button Arrow [Rotate Open]**

### Maximum context

The **Element** and **Action** phrases should give as much context to the purpose of this interaction in the project.

When creating our interactions name, we should answer the question, "What is this interaction?"

A new developer entering the build should know about what this interaction is doing in the project. Use powerful keywords to describe the interaction.

### Minimal words

We always want to keep descriptions minimal. Short is good. We want to give the most information in the least amount of words.

Ideally, our interaction names never overflow past Designer's Interactions UI panel.

If our names continuously overflow the UI panel, we're likely being too descriptive in our interaction naming.

We use capital letters for the first character of each word to improve scan-ability of the Interaction name.

### Square brackets

Separate the **Action** and **State** keywords from the **Element** keywords by using square brackets around **Action** and **State**.

This visually separates both parts of the interaction name.

## Examples

### Examples using general naming

With general naming like 'button' or 'image', we imply the interactions are used as universal interactions.

**Button Arrow [Move In]**
The default button arrow moves in. "in" is the state of the move Action.

**Button Arrow [Move Out]**
The primary button effect "out" state moves the arrow to the original position.

**Image [Show Scroll In]**
Image appears when the user scrolls into the section.

**Image [Hide Scroll Out]**
Image hides when the user scrolls out of the section.

**Nav Menu [Open]**
The primary nav menu open interaction.

**Nav Menu [Close]**
The primary nav menu close interaction.

### Examples using specific naming

With specific naming, we can clarify what unique interactions are doing for specific elements. Through naming, we imply the interactions are used as specific use cases.

**Home Hero Lottie [Show]**
Show and play Lottie explosion on the home hero section.

**Home Hero Lottie [Hide]**
Hides and resets the Lottie explosion animation on the home hero section.

**Jobs Item Modal [Open]**
Open apply modal, which is triggered by a jobs item.

**Jobs Item Modal [Close]**
Close apply modal, which is triggered by a jobs item.

**Contact Form Input [Height Increase]**
Increase the height of the contact form input.

**Contact Form Input [Height Decrease]**
Decrease the height of the contact form input.

## Keywords

### Action keywords

Use keywords that best describe the action that occurs when the interaction runs.

Use the least amount of words to give the most context about the interaction's purpose.

#### Popular action keywords

- Show
- Hide
- Move
- Rotate
- Scale

### State keywords

Add state keywords to communicate a toggling state of a an interaction sequence.

#### Popular state keywords

- In / Out
- Open / Close
- Increase / Decrease
- Expand / Collapse

### Action and State can mix

We do not need to strictly follow **[Action + state]**. We can be flexible with our keywords inside the brackets.

It is possible that Action and State keywords are used together **Element [Action + State]**.

It is possible they are used individually **Element [Action]** or **Element [State]**.

It is possible that a State keyword alone is better than Action + State. For example, "**Jobs Item Modal [Open]**".

It is possible that "Show" and "Hide" is seen as an Action or a State (Visible / Hidden). "**Jobs Item Modal [Show]**".

Don't spend a lot of time thinking about Action + State. Pick something that is clear and continue working.

**Our goal:** Action and State keywords should be arranged inside the brackets to give the user the maximum amount of context into the interaction's purpose.

### Trigger keywords

If we need to add more information to our interaction name, we can use keywords to help us understand the trigger.

#### Trigger keyword examples

- Click
- Hover
- Mouse Move
- Scroll
- While Scrolling
- Load

**We must add trigger keywords carefully.**

#### Optionally add trigger keywords

Adding trigger keywords in the interaction name is technically inaccurate based on how Webflow Interactions are configured.

Webflow interactions do not include triggers in the action steps. Therefore Webflow interactions can run with different triggers.

If we include the trigger in the name of the interaction, then the interaction can not be shared by different triggers.

For example, an interaction is created to "open" a dropdown nav item inside the nav component. A mega menu.

- On desktop, the interaction runs with a "hover" trigger.
- On mobile, the interaction runs with a "click" trigger.
- The same interaction is used for both devices. The element trigger, as well as the trigger type, is different based on device.
- This is a clear example of a trigger not belonging to an interaction. Triggers are separate.
- Using the name "**Nav Dropdown [Open Hover In]**" is inaccurate since it is triggered differently on mobile.
- Using the name "**Nav Dropdown [Open]**" accurately describes the interaction configuration. The interaction opens the dropdown. This is what the configuration does.

#### Using trigger keywords

If adding the trigger keyword greatly enhances the interaction context, we may want to add the keyword.

Even if a trigger is not included in the interaction configuration, there are instances where a trigger can give important context.

**Discount Modal [Delay On Load]**

We use the word "delay" and "load" in this name, which tells us important information about the action of this modal. If the purpose of this interaction is to "delay on load", these keywords create clarity.

**Blank Div [Open Modal With JS Click]**

This Div Block is used as a click trigger to initiate a Webflow Interaction with JavaScript. The interaction was created specifically to listen for a click from JavaScript. After the JS click, the Webflow Interaction runs. Adding the "click" trigger keyword to this name helps communicate that.

### Responsive keywords

When an interaction is created specifically for a certain breakpoint, responsive level, or device type, we can add that keyword at the end of the interaction name.

**Nav Sidebar Slide [Show] [Mobile]**
Show the nav sidebar on mobile only

**Hero Scroll Trigger Div [In] [Tablet Mobile]**
Show the nav sidebar

**Background Textures [Hover In] [Desktop]**
We only have to specific desktop if it's for Desktop only and turned off for tablet and mobile.

‍

## Conflicts

If you're in a conflict with naming, don't overthink it.

Just make a decision and move forward.

The decision to give a good name to an element, action, state, or trigger is not always clear. That's ok. Pick something and move on.

Taking any significant time to think about a naming is not advised. Breaking your workflow to overthink naming is not advised.

Happy interacting.

import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "dapei Workspace Portal",
  description: "AI Native Engineering Context OS - Workspace durable knowledge & cognitive assets",
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Durable Docs', link: '/architecture/' },
      { text: 'Cognitive Assets', link: '/compiled/profiles' },
      { text: 'Features', link: '/compiled/features' }
    ],

    sidebar: [
      {
        text: 'Overview',
        items: [
          { text: 'Workspace Map', link: '/' }
        ]
      },
      {
        text: 'Durable Knowledge',
        items: [
          { text: 'Architecture & Boundary', link: '/architecture/' },
          { text: 'Standards & Rules', link: '/standards/' },
          { text: 'Terminology Glossary', link: '/glossary/' },
          { text: 'Design Decisions (ADR)', link: '/decisions/' }
        ]
      },
      {
        text: 'Cognitive Assets (Compiled)',
        items: [
          { text: 'Repository Profiles', link: '/compiled/profiles' },
          { text: 'Entry surfaces', link: '/compiled/entries' },
          { text: 'Behavior Flows', link: '/compiled/behaviors' },
          { text: 'State Machines', link: '/compiled/state-machines' }
        ]
      },
      {
        text: 'Active Features',
        items: [
          { text: 'Feature Backlog', link: '/compiled/features' }
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/ygwa/dapei-skill' }
    ]
  },
  markdown: {
    // Custom markdown configuration if needed
  }
})

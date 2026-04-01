import { ContentTemplate } from '../types/seo';

export const TEMPLATES: Record<string, ContentTemplate> = {
  'how-to': { label: 'How-To Guide', icon: 'BookOpen', words: '1,800-2,500', seo: 92, structure: 'Problem -> Steps -> Result -> CTA' },
  'comparison': { label: 'Comparison', icon: 'Scale', words: '2,000-3,000', seo: 95, structure: 'Context -> Feature matrix -> Verdict' },
  'case-study': { label: 'Case Study', icon: 'BarChart3', words: '1,500-2,000', seo: 88, structure: 'Challenge -> Approach -> Results -> Takeaways' },
  'listicle': { label: 'Listicle', icon: 'List', words: '2,000-3,500', seo: 85, structure: 'Intro -> Ranked items -> Summary' },
  'thought-leader': { label: 'Thought Leadership', icon: 'Lightbulb', words: '1,200-1,800', seo: 78, structure: 'Hot take -> Evidence -> Implications' },
  'technical': { label: 'Technical Guide', icon: 'Wrench', words: '2,500-4,000', seo: 90, structure: 'Problem -> Context -> Implementation -> Code' },
  'pillar': { label: 'Pillar Page', icon: 'Landmark', words: '4,000-6,000', seo: 97, structure: 'Overview -> Deep sections -> Internal links -> FAQ' },
};

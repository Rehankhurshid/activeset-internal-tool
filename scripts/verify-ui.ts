#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

interface VerificationResult {
  file: string;
  category: string;
  check: string;
  passed: boolean;
  message?: string;
  suggestion?: string;
}

interface ComponentAnalysis {
  hasShadcnImports: boolean;
  usesThemeVariables: boolean;
  hasResponsiveClasses: boolean;
  hasAccessibilityAttrs: boolean;
  customImplementations: string[];
  suggestions: string[];
}

class UIVerificationAgent {
  private results: VerificationResult[] = [];

  // Shadcn component patterns
  private shadcnPatterns = {
    imports: /from\s+['"]@\/components\/ui\//g,
    themeVars: /(?:background|foreground|primary|secondary|muted|accent|destructive)/g,
    responsive: /(?:sm:|md:|lg:|xl:|2xl:)/g,
    darkMode: /dark:/g,
    ariaAttrs: /(?:aria-|role=)/g,
    dataAttrs: /data-[\w-]+=/g,
  };

  // Custom implementations that should use shadcn
  private customToShadcn = new Map([
    ['className=".*modal.*"', 'Dialog component'],
    ['className=".*spinner.*"', 'Skeleton component'],
    ['className=".*loading.*"', 'Skeleton or Spinner'],
    ['<button\\s+(?!.*from.*ui/button)', 'Button component'],
    ['<input\\s+(?!.*from.*ui/input)', 'Input component'],
    ['className=".*card.*"(?!.*from.*ui/card)', 'Card component'],
    ['className=".*dropdown.*"(?!.*from.*ui/dropdown)', 'DropdownMenu component'],
  ]);

  async analyzeComponent(filePath: string): Promise<ComponentAnalysis> {
    const content = fs.readFileSync(filePath, 'utf-8');

    const analysis: ComponentAnalysis = {
      hasShadcnImports: this.shadcnPatterns.imports.test(content),
      usesThemeVariables: this.shadcnPatterns.themeVars.test(content),
      hasResponsiveClasses: this.shadcnPatterns.responsive.test(content),
      hasAccessibilityAttrs: this.shadcnPatterns.ariaAttrs.test(content),
      customImplementations: [],
      suggestions: []
    };

    // Check for custom implementations
    for (const [pattern, suggestion] of this.customToShadcn) {
      const regex = new RegExp(pattern, 'gi');
      if (regex.test(content)) {
        analysis.customImplementations.push(pattern);
        analysis.suggestions.push(`Consider using ${suggestion}`);
      }
    }

    return analysis;
  }

  verifyFile(filePath: string): void {
    const analysis = this.analyzeComponentSync(filePath);
    const fileName = path.basename(filePath);

    // Check shadcn usage
    this.results.push({
      file: fileName,
      category: 'shadcnUsage',
      check: 'Uses shadcn components',
      passed: analysis.hasShadcnImports,
      message: analysis.hasShadcnImports
        ? 'Component uses shadcn/ui components'
        : 'No shadcn/ui imports found',
      suggestion: !analysis.hasShadcnImports
        ? 'Import and use shadcn/ui components where applicable'
        : undefined
    });

    // Check theming
    this.results.push({
      file: fileName,
      category: 'styling',
      check: 'Uses theme variables',
      passed: analysis.usesThemeVariables,
      message: analysis.usesThemeVariables
        ? 'Proper theme variables used'
        : 'Not using theme CSS variables',
      suggestion: !analysis.usesThemeVariables
        ? 'Use theme variables like bg-background, text-foreground'
        : undefined
    });

    // Check responsive design
    this.results.push({
      file: fileName,
      category: 'styling',
      check: 'Responsive design',
      passed: analysis.hasResponsiveClasses,
      message: analysis.hasResponsiveClasses
        ? 'Has responsive breakpoints'
        : 'Missing responsive classes',
      suggestion: !analysis.hasResponsiveClasses
        ? 'Add responsive prefixes (sm:, md:, lg:) for different screen sizes'
        : undefined
    });

    // Check accessibility
    this.results.push({
      file: fileName,
      category: 'accessibility',
      check: 'Accessibility attributes',
      passed: analysis.hasAccessibilityAttrs,
      message: analysis.hasAccessibilityAttrs
        ? 'Has accessibility attributes'
        : 'Missing accessibility attributes',
      suggestion: !analysis.hasAccessibilityAttrs
        ? 'Add ARIA labels and roles for screen readers'
        : undefined
    });

    // Report custom implementations
    if (analysis.customImplementations.length > 0) {
      analysis.suggestions.forEach(suggestion => {
        this.results.push({
          file: fileName,
          category: 'shadcnUsage',
          check: 'Custom implementation detected',
          passed: false,
          message: 'Found custom implementation that could use shadcn',
          suggestion
        });
      });
    }
  }

  private analyzeComponentSync(filePath: string): ComponentAnalysis {
    const content = fs.readFileSync(filePath, 'utf-8');

    const analysis: ComponentAnalysis = {
      hasShadcnImports: this.shadcnPatterns.imports.test(content),
      usesThemeVariables: this.shadcnPatterns.themeVars.test(content),
      hasResponsiveClasses: this.shadcnPatterns.responsive.test(content),
      hasAccessibilityAttrs: this.shadcnPatterns.ariaAttrs.test(content),
      customImplementations: [],
      suggestions: []
    };

    // Check for custom implementations
    for (const [pattern, suggestion] of this.customToShadcn) {
      const regex = new RegExp(pattern, 'gi');
      if (regex.test(content)) {
        analysis.customImplementations.push(pattern);
        analysis.suggestions.push(`Consider using ${suggestion}`);
      }
    }

    return analysis;
  }

  calculateScore(): number {
    const weights = {
      shadcnUsage: 0.3,
      accessibility: 0.25,
      styling: 0.25,
      performance: 0.2
    };

    let totalScore = 0;
    let totalWeight = 0;

    for (const [category, weight] of Object.entries(weights)) {
      const categoryResults = this.results.filter(r => r.category === category);
      if (categoryResults.length > 0) {
        const categoryScore = categoryResults.filter(r => r.passed).length / categoryResults.length;
        totalScore += categoryScore * weight;
        totalWeight += weight;
      }
    }

    return totalWeight > 0 ? (totalScore / totalWeight) * 100 : 0;
  }

  generateReport(): string {
    const score = this.calculateScore();
    const passed = this.results.filter(r => r.passed);
    const failed = this.results.filter(r => !r.passed);

    let report = `# UI Verification Report\n\n`;
    report += `## Overall Score: ${score.toFixed(1)}%\n\n`;

    // Summary by category
    const categories = ['shadcnUsage', 'styling', 'accessibility', 'performance'];
    report += `## Summary by Category\n\n`;

    for (const category of categories) {
      const categoryResults = this.results.filter(r => r.category === category);
      if (categoryResults.length > 0) {
        const categoryScore = (categoryResults.filter(r => r.passed).length / categoryResults.length) * 100;
        const emoji = categoryScore >= 80 ? '✅' : categoryScore >= 60 ? '⚠️' : '🔴';
        report += `${emoji} **${category}**: ${categoryScore.toFixed(1)}%\n`;
      }
    }

    // Passed checks
    if (passed.length > 0) {
      report += `\n## ✅ Passed Checks (${passed.length})\n\n`;
      const groupedPassed = this.groupByFile(passed);
      for (const [file, checks] of Object.entries(groupedPassed)) {
        report += `### ${file}\n`;
        checks.forEach(check => {
          report += `- ✅ ${check.check}: ${check.message}\n`;
        });
        report += '\n';
      }
    }

    // Failed checks with suggestions
    if (failed.length > 0) {
      report += `## ⚠️ Improvements Needed (${failed.length})\n\n`;
      const groupedFailed = this.groupByFile(failed);
      for (const [file, checks] of Object.entries(groupedFailed)) {
        report += `### ${file}\n`;
        checks.forEach(check => {
          report += `- ❌ ${check.check}: ${check.message}\n`;
          if (check.suggestion) {
            report += `  **Suggestion**: ${check.suggestion}\n`;
          }
        });
        report += '\n';
      }
    }

    // Recommendations
    report += `## 📋 Recommendations\n\n`;
    report += this.generateRecommendations();

    return report;
  }

  private groupByFile(results: VerificationResult[]): Record<string, VerificationResult[]> {
    return results.reduce((acc, result) => {
      if (!acc[result.file]) {
        acc[result.file] = [];
      }
      acc[result.file].push(result);
      return acc;
    }, {} as Record<string, VerificationResult[]>);
  }

  private generateRecommendations(): string {
    const suggestions = new Set<string>();

    this.results
      .filter(r => !r.passed && r.suggestion)
      .forEach(r => suggestions.add(r.suggestion!));

    if (suggestions.size === 0) {
      return '- All checks passed! Your UI follows shadcn best practices.\n';
    }

    let recommendations = '';
    let priority = 1;

    suggestions.forEach(suggestion => {
      recommendations += `${priority}. ${suggestion}\n`;
      priority++;
    });

    return recommendations;
  }

  async run(pattern: string = 'src/components/**/*.tsx'): Promise<void> {
    console.log('🔍 Starting UI Verification...\n');

    const files = await glob(pattern);

    if (files.length === 0) {
      console.log('No files found matching pattern:', pattern);
      return;
    }

    console.log(`Found ${files.length} files to verify\n`);

    files.forEach(file => {
      this.verifyFile(file);
    });

    const report = this.generateReport();

    // Write report to file
    const reportPath = path.join(process.cwd(), 'ui-verification-report.md');
    fs.writeFileSync(reportPath, report);

    // Print summary to console
    const score = this.calculateScore();
    console.log('━'.repeat(40));
    console.log(`UI Compliance Score: ${score.toFixed(1)}%`);
    console.log('━'.repeat(40));

    const categories = ['shadcnUsage', 'styling', 'accessibility', 'performance'];
    categories.forEach(category => {
      const categoryResults = this.results.filter(r => r.category === category);
      if (categoryResults.length > 0) {
        const categoryScore = (categoryResults.filter(r => r.passed).length / categoryResults.length) * 100;
        const emoji = categoryScore >= 80 ? '✅' : categoryScore >= 60 ? '⚠️' : '🔴';
        console.log(`${emoji} ${category}: ${categoryScore.toFixed(1)}%`);
      }
    });

    console.log('\n📄 Full report saved to:', reportPath);
  }
}

// CLI execution
if (require.main === module) {
  const agent = new UIVerificationAgent();
  const pattern = process.argv[2] || 'src/components/**/*.{tsx,jsx}';

  agent.run(pattern).catch(console.error);
}

export { UIVerificationAgent };
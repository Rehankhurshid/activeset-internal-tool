import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';

const String _webAppUrl = String.fromEnvironment(
  'WEBAPP_URL',
  defaultValue: 'https://app.activeset.co/modules/project-links',
);

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const ProjectLinksApp());
}

class ProjectLinksApp extends StatelessWidget {
  const ProjectLinksApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Project Links',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0F172A)),
        useMaterial3: true,
      ),
      home: const ProjectLinksScreen(),
    );
  }
}

class ProjectLinksScreen extends StatefulWidget {
  const ProjectLinksScreen({super.key});

  @override
  State<ProjectLinksScreen> createState() => _ProjectLinksScreenState();
}

class _ProjectLinksScreenState extends State<ProjectLinksScreen> {
  late final WebViewController _controller;
  Uri? _initialUri;
  int _loadingProgress = 0;
  bool _hasMainFrameError = false;
  String? _errorDescription;

  @override
  void initState() {
    super.initState();
    _initialUri = Uri.tryParse(_webAppUrl);

    final uri = _initialUri;
    if (uri == null || !uri.hasScheme || !uri.hasAuthority) {
      _hasMainFrameError = true;
      _errorDescription =
          'Invalid WEBAPP_URL: "$_webAppUrl". Provide a full URL like https://app.activeset.co/modules/project-links.';
      return;
    }

    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onProgress: (progress) {
            if (!mounted) {
              return;
            }
            setState(() {
              _loadingProgress = progress.clamp(0, 100);
            });
          },
          onPageStarted: (_) {
            if (!mounted) {
              return;
            }
            setState(() {
              _hasMainFrameError = false;
              _errorDescription = null;
              _loadingProgress = 0;
            });
          },
          onPageFinished: (_) {
            if (!mounted) {
              return;
            }
            setState(() {
              _loadingProgress = 100;
            });
          },
          onNavigationRequest: _onNavigationRequest,
          onWebResourceError: (error) {
            if ((error.isForMainFrame ?? true) == false || !mounted) {
              return;
            }
            setState(() {
              _hasMainFrameError = true;
              _errorDescription = error.description;
            });
          },
        ),
      )
      ..loadRequest(uri);
  }

  FutureOr<NavigationDecision> _onNavigationRequest(
    NavigationRequest request,
  ) async {
    final uri = Uri.tryParse(request.url);
    if (uri == null) {
      return NavigationDecision.prevent;
    }

    if (uri.scheme == 'http' || uri.scheme == 'https') {
      return NavigationDecision.navigate;
    }

    final launched = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!launched && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not open external link.')),
      );
    }
    return NavigationDecision.prevent;
  }

  Future<bool> _onWillPop() async {
    if (_initialUri == null) {
      return true;
    }

    if (await _controller.canGoBack()) {
      await _controller.goBack();
      return false;
    }

    return true;
  }

  Future<void> _reload() async {
    if (_initialUri == null) {
      return;
    }

    setState(() {
      _hasMainFrameError = false;
      _errorDescription = null;
      _loadingProgress = 0;
    });
    await _controller.reload();
  }

  @override
  Widget build(BuildContext context) {
    final showProgress = !_hasMainFrameError && _loadingProgress < 100;

    // ignore: deprecated_member_use
    return WillPopScope(
      onWillPop: _onWillPop,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Project Links'),
          actions: [
            IconButton(
              tooltip: 'Reload',
              onPressed: _initialUri == null ? null : _reload,
              icon: const Icon(Icons.refresh),
            ),
          ],
        ),
        body: _initialUri == null
            ? _ErrorView(
                message:
                    _errorDescription ?? 'Invalid WEBAPP_URL configuration.',
              )
            : Stack(
                children: [
                  WebViewWidget(controller: _controller),
                  if (showProgress)
                    LinearProgressIndicator(value: _loadingProgress / 100),
                  if (_hasMainFrameError)
                    _ErrorView(
                      message:
                          _errorDescription ??
                          'Could not load the web app. Check your connection and try again.',
                      retryLabel: 'Try Again',
                      onRetry: _reload,
                    ),
                ],
              ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, this.retryLabel, this.onRetry});

  final String message;
  final String? retryLabel;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 56),
            const SizedBox(height: 12),
            Text(
              'Unable to open Project Links',
              style: Theme.of(context).textTheme.titleLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(message, textAlign: TextAlign.center),
            if (onRetry != null) ...[
              const SizedBox(height: 16),
              FilledButton(
                onPressed: onRetry,
                child: Text(retryLabel ?? 'Retry'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

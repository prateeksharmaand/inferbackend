// ============================================================================
// WALLET STATE MANAGEMENT (Provider/Riverpod)
// Place in: lib/providers/wallet_provider.dart
// ============================================================================

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

class WalletModel {
  final String id;
  final double currentBalance;
  final double lifetimePurchased;
  final double lifetimeUsed;
  final bool subscriptionActive;
  final DateTime? subscriptionExpiresAt;
  final bool isLocked;
  final String? lockedReason;

  WalletModel({
    required this.id,
    required this.currentBalance,
    required this.lifetimePurchased,
    required this.lifetimeUsed,
    required this.subscriptionActive,
    this.subscriptionExpiresAt,
    this.isLocked = false,
    this.lockedReason,
  });

  factory WalletModel.fromJson(Map<String, dynamic> json) {
    return WalletModel(
      id: json['id'] ?? '',
      currentBalance: (json['currentBalance'] ?? 0).toDouble(),
      lifetimePurchased: (json['lifetimePurchased'] ?? 0).toDouble(),
      lifetimeUsed: (json['lifetimeUsed'] ?? 0).toDouble(),
      subscriptionActive: json['subscriptionActive'] ?? true,
      subscriptionExpiresAt: json['subscriptionExpiresAt'] != null
          ? DateTime.parse(json['subscriptionExpiresAt'])
          : null,
      isLocked: json['isLocked'] ?? false,
      lockedReason: json['lockedReason'],
    );
  }
}

class WalletSummary {
  final double currentBalance;
  final double lifetimePurchased;
  final double lifetimeUsed;
  final bool subscriptionActive;
  final int todayTransactions;
  final double todayCreditsUsed;
  final int monthTransactions;
  final double monthCreditsUsed;
  final int daysRemaining;
  final List<Transaction> recentTransactions;

  WalletSummary({
    required this.currentBalance,
    required this.lifetimePurchased,
    required this.lifetimeUsed,
    required this.subscriptionActive,
    required this.todayTransactions,
    required this.todayCreditsUsed,
    required this.monthTransactions,
    required this.monthCreditsUsed,
    required this.daysRemaining,
    required this.recentTransactions,
  });

  factory WalletSummary.fromJson(Map<String, dynamic> json) {
    return WalletSummary(
      currentBalance: (json['currentBalance'] ?? 0).toDouble(),
      lifetimePurchased: (json['lifetimePurchased'] ?? 0).toDouble(),
      lifetimeUsed: (json['lifetimeUsed'] ?? 0).toDouble(),
      subscriptionActive: json['subscriptionActive'] ?? true,
      todayTransactions: json['todayTransactions'] ?? 0,
      todayCreditsUsed: (json['todayCreditsUsed'] ?? 0).toDouble(),
      monthTransactions: json['monthTransactions'] ?? 0,
      monthCreditsUsed: (json['monthCreditsUsed'] ?? 0).toDouble(),
      daysRemaining: json['daysRemaining'] ?? -1,
      recentTransactions: (json['recentTransactions'] as List<dynamic>?)
              ?.map((t) => Transaction.fromJson(t))
              .toList() ??
          [],
    );
  }
}

class Transaction {
  final String id;
  final String type; // deduction, purchase, refund, etc
  final String service; // whatsapp, sms, prescription
  final double amount;
  final double balanceAfter;
  final DateTime createdAt;

  Transaction({
    required this.id,
    required this.type,
    required this.service,
    required this.amount,
    required this.balanceAfter,
    required this.createdAt,
  });

  factory Transaction.fromJson(Map<String, dynamic> json) {
    return Transaction(
      id: json['id'] ?? '',
      type: json['type'] ?? '',
      service: json['service'] ?? '',
      amount: (json['amount'] ?? 0).toDouble(),
      balanceAfter: (json['balanceAfter'] ?? 0).toDouble(),
      createdAt: DateTime.parse(json['createdAt'] ?? DateTime.now().toIso8601String()),
    );
  }
}

class CreditPack {
  final String id;
  final String name;
  final double credits;
  final double priceInr;
  final double gstAmount;
  final double totalAmount;
  final double discount;
  final bool isPopular;
  final bool isBestValue;

  CreditPack({
    required this.id,
    required this.name,
    required this.credits,
    required this.priceInr,
    required this.gstAmount,
    required this.totalAmount,
    required this.discount,
    this.isPopular = false,
    this.isBestValue = false,
  });

  factory CreditPack.fromJson(Map<String, dynamic> json) {
    return CreditPack(
      id: json['id'] ?? '',
      name: json['name'] ?? '',
      credits: (json['credits'] ?? 0).toDouble(),
      priceInr: (json['priceInr'] ?? 0).toDouble(),
      gstAmount: (json['gstAmount'] ?? 0).toDouble(),
      totalAmount: (json['totalAmount'] ?? 0).toDouble(),
      discount: (json['discount'] ?? 0).toDouble(),
      isPopular: json['isPopular'] ?? false,
      isBestValue: json['isBestValue'] ?? false,
    );
  }
}

class BalanceCheckResult {
  final bool hasBalance;
  final double currentBalance;
  final double requiredCredits;
  final String service;
  final double pricePerUnit;

  BalanceCheckResult({
    required this.hasBalance,
    required this.currentBalance,
    required this.requiredCredits,
    required this.service,
    required this.pricePerUnit,
  });

  factory BalanceCheckResult.fromJson(Map<String, dynamic> json) {
    return BalanceCheckResult(
      hasBalance: json['hasBalance'] ?? false,
      currentBalance: (json['currentBalance'] ?? 0).toDouble(),
      requiredCredits: (json['requiredCredits'] ?? 0).toDouble(),
      service: json['pricing']['service'] ?? '',
      pricePerUnit: (json['pricing']['pricePerUnit'] ?? 0).toDouble(),
    );
  }
}

// ============================================================================
// WALLET SERVICE (API Client)
// Place in: lib/services/wallet_service.dart
// ============================================================================

class WalletService extends ChangeNotifier {
  static const String baseUrl = 'https://api.inferapp.online/api';
  final String _token; // JWT token from auth

  WalletService(this._token);

  WalletModel? _wallet;
  WalletSummary? _summary;
  List<CreditPack> _packs = [];
  bool _isLoading = false;
  String? _error;

  // Getters
  WalletModel? get wallet => _wallet;
  WalletSummary? get summary => _summary;
  List<CreditPack> get packs => _packs;
  bool get isLoading => _isLoading;
  String? get error => _error;

  // Initialize wallet
  Future<void> initWallet() async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final response = await http.post(
        Uri.parse('$baseUrl/wallet/init'),
        headers: {'Authorization': 'Bearer $_token'},
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        _wallet = WalletModel.fromJson(data['wallet']);
        notifyListeners();
      } else {
        _error = 'Failed to initialize wallet';
      }
    } catch (e) {
      _error = e.toString();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  // Fetch wallet details
  Future<void> fetchWallet() async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final response = await http.get(
        Uri.parse('$baseUrl/wallet'),
        headers: {'Authorization': 'Bearer $_token'},
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        _wallet = WalletModel.fromJson(data['wallet']);
        notifyListeners();
      } else {
        _error = 'Failed to fetch wallet';
      }
    } catch (e) {
      _error = e.toString();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  // Fetch wallet summary
  Future<void> fetchSummary() async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final response = await http.get(
        Uri.parse('$baseUrl/wallet/summary'),
        headers: {'Authorization': 'Bearer $_token'},
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        _summary = WalletSummary.fromJson(data['summary']);
        notifyListeners();
      } else {
        _error = 'Failed to fetch summary';
      }
    } catch (e) {
      _error = e.toString();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  // Fetch packs
  Future<void> fetchPacks() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/wallet/packs'),
        headers: {'Authorization': 'Bearer $_token'},
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        _packs = (data['packs'] as List<dynamic>)
            .map((p) => CreditPack.fromJson(p))
            .toList();
        notifyListeners();
      } else {
        _error = 'Failed to fetch packs';
      }
    } catch (e) {
      _error = e.toString();
    }
  }

  // Check balance for service
  Future<BalanceCheckResult?> checkBalance(String serviceType, [int quantity = 1]) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/wallet/check-balance'),
        headers: {
          'Authorization': 'Bearer $_token',
          'Content-Type': 'application/json',
        },
        body: jsonEncode({
          'serviceType': serviceType,
          'quantity': quantity,
        }),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return BalanceCheckResult.fromJson(data);
      } else {
        _error = 'Failed to check balance';
        return null;
      }
    } catch (e) {
      _error = e.toString();
      return null;
    }
  }

  // Create payment order
  Future<Map<String, dynamic>?> createPaymentOrder({
    String? packId,
    double? customAmount,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/wallet/recharge/order'),
        headers: {
          'Authorization': 'Bearer $_token',
          'Content-Type': 'application/json',
        },
        body: jsonEncode({
          if (packId != null) 'packId': packId,
          if (customAmount != null) 'customAmount': customAmount,
        }),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return data['order'];
      } else {
        _error = 'Failed to create payment order';
        return null;
      }
    } catch (e) {
      _error = e.toString();
      return null;
    }
  }

  // Verify payment
  Future<bool> verifyPayment({
    required String orderId,
    required String razorpayPaymentId,
    required String razorpaySignature,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/wallet/recharge/verify'),
        headers: {
          'Authorization': 'Bearer $_token',
          'Content-Type': 'application/json',
        },
        body: jsonEncode({
          'orderId': orderId,
          'razorpayPaymentId': razorpayPaymentId,
          'razorpaySignature': razorpaySignature,
        }),
      );

      if (response.statusCode == 200) {
        await fetchWallet(); // Refresh wallet balance
        return true;
      } else {
        _error = 'Payment verification failed';
        return false;
      }
    } catch (e) {
      _error = e.toString();
      return false;
    }
  }
}

// ============================================================================
// WALLET DASHBOARD SCREEN
// Place in: lib/screens/wallet/wallet_dashboard_screen.dart
// ============================================================================

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';

class WalletDashboardScreen extends StatefulWidget {
  const WalletDashboardScreen({Key? key}) : super(key: key);

  @override
  State<WalletDashboardScreen> createState() => _WalletDashboardScreenState();
}

class _WalletDashboardScreenState extends State<WalletDashboardScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      Provider.of<WalletService>(context, listen: false).fetchSummary();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Wallet & Credits'),
        elevation: 0,
        backgroundColor: const Color(0xFF6366F1),
      ),
      backgroundColor: Colors.grey[50],
      body: Consumer<WalletService>(
        builder: (context, walletService, child) {
          if (walletService.isLoading && walletService.summary == null) {
            return const Center(child: CircularProgressIndicator());
          }

          if (walletService.summary == null) {
            return Center(
              child: Text(walletService.error ?? 'Failed to load wallet'),
            );
          }

          final summary = walletService.summary!;

          return RefreshIndicator(
            onRefresh: () => walletService.fetchSummary(),
            child: SingleChildScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Balance Card
                    Container(
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [Color(0xFF6366F1), Color(0xFF7C5CFF)],
                        ),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Available Balance',
                            style: TextStyle(
                              color: Colors.white70,
                              fontSize: 14,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                          const SizedBox(height: 12),
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.baseline,
                            textBaseline: TextBaseline.alphabetic,
                            children: [
                              Text(
                                '₹${summary.currentBalance.toStringAsFixed(2)}',
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 36,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              const SizedBox(width: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                  vertical: 6,
                                ),
                                decoration: BoxDecoration(
                                  color: Colors.white.withOpacity(0.2),
                                  borderRadius: BorderRadius.circular(20),
                                ),
                                child: Text(
                                  '${summary.currentBalance.toStringAsFixed(0)} credits',
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 20),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text(
                                    'Lifetime Purchased',
                                    style: TextStyle(
                                      color: Colors.white70,
                                      fontSize: 12,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    '₹${summary.lifetimePurchased.toStringAsFixed(2)}',
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 16,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ],
                              ),
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text(
                                    'Total Used',
                                    style: TextStyle(
                                      color: Colors.white70,
                                      fontSize: 12,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    '₹${summary.lifetimeUsed.toStringAsFixed(2)}',
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 16,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ],
                              ),
                              if (summary.daysRemaining > 0)
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const Text(
                                      'Days Remaining',
                                      style: TextStyle(
                                        color: Colors.white70,
                                        fontSize: 12,
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      '~${summary.daysRemaining} days',
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 16,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                  ],
                                ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),

                    // Recharge Button
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: () => _showRechargeBottomSheet(context),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF6366F1),
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        child: const Text(
                          'Recharge Credits',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 24),

                    // Usage Stats
                    Text(
                      'This Month',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: Colors.grey[200]!),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Transactions',
                                style: TextStyle(
                                  color: Colors.grey,
                                  fontSize: 12,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                '${summary.monthTransactions}',
                                style: const TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ],
                          ),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Credits Used',
                                style: TextStyle(
                                  color: Colors.grey,
                                  fontSize: 12,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                '₹${summary.monthCreditsUsed.toStringAsFixed(2)}',
                                style: const TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),

                    // Recent Transactions
                    Text(
                      'Recent Transactions',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 12),
                    if (summary.recentTransactions.isEmpty)
                      Center(
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Text(
                            'No transactions yet',
                            style: Theme.of(context).textTheme.bodyMedium,
                          ),
                        ),
                      )
                    else
                      ListView.separated(
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        itemCount: summary.recentTransactions.length,
                        separatorBuilder: (_, __) => Divider(
                          height: 1,
                          color: Colors.grey[200],
                        ),
                        itemBuilder: (context, index) {
                          final transaction = summary.recentTransactions[index];
                          return _buildTransactionTile(transaction);
                        },
                      ),
                    const SizedBox(height: 24),

                    // View All Button
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton(
                        onPressed: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => const TransactionHistoryScreen(),
                            ),
                          );
                        },
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        child: const Text('View All Transactions'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildTransactionTile(Transaction transaction) {
    final serviceIcon = _getServiceIcon(transaction.service);
    final isDeduction = transaction.type == 'deduction';

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(
            child: Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: Color(isDeduction ? 0xFFFF6B6B : 0xFF51CF66).withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Center(
                    child: Text(
                      serviceIcon,
                      style: const TextStyle(fontSize: 24),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _getServiceName(transaction.service),
                        style: const TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 14,
                        ),
                      ),
                      Text(
                        DateFormat('MMM dd, yyyy').format(transaction.createdAt),
                        style: TextStyle(
                          color: Colors.grey[600],
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Text(
            '${isDeduction ? '−' : '+'} ₹${transaction.amount.toStringAsFixed(2)}',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.bold,
              color: isDeduction ? Colors.red : Colors.green,
            ),
          ),
        ],
      ),
    );
  }

  String _getServiceIcon(String service) {
    switch (service) {
      case 'whatsapp':
        return '💬';
      case 'sms':
        return '📱';
      case 'prescription':
        return '💊';
      default:
        return '✨';
    }
  }

  String _getServiceName(String service) {
    switch (service) {
      case 'whatsapp':
        return 'WhatsApp Message';
      case 'sms':
        return 'SMS Message';
      case 'prescription':
        return 'Prescription Created';
      default:
        return 'Transaction';
    }
  }

  void _showRechargeBottomSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (context) => const RechargeBottomSheet(),
    );
  }
}

// ============================================================================
// RECHARGE BOTTOM SHEET & PAYMENT FLOW
// Place in: lib/screens/wallet/recharge_screen.dart
// ============================================================================

class RechargeBottomSheet extends StatefulWidget {
  const RechargeBottomSheet({Key? key}) : super(key: key);

  @override
  State<RechargeBottomSheet> createState() => _RechargeBottomSheetState();
}

class _RechargeBottomSheetState extends State<RechargeBottomSheet> {
  String? _selectedPackId;
  bool _isProcessing = false;

  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      Provider.of<WalletService>(context, listen: false).fetchPacks();
    });
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      expand: false,
      builder: (context, scrollController) {
        return Consumer<WalletService>(
          builder: (context, walletService, child) {
            return SingleChildScrollView(
              controller: scrollController,
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Handle bar
                    Center(
                      child: Container(
                        width: 40,
                        height: 4,
                        decoration: BoxDecoration(
                          color: Colors.grey[300],
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                    const SizedBox(height: 24),

                    // Title
                    const Text(
                      'Recharge Credits',
                      style: TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Choose a pack that suits your needs',
                      style: TextStyle(
                        color: Colors.grey[600],
                        fontSize: 14,
                      ),
                    ),
                    const SizedBox(height: 24),

                    // Packs
                    if (walletService.packs.isEmpty)
                      const Center(child: CircularProgressIndicator())
                    else
                      Column(
                        children: walletService.packs.map((pack) {
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: _buildPackCard(pack),
                          );
                        }).toList(),
                      ),

                    const SizedBox(height: 24),

                    // Proceed Button
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: _selectedPackId == null || _isProcessing
                            ? null
                            : () => _proceedToPayment(context, walletService),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF6366F1),
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        child: _isProcessing
                            ? const SizedBox(
                                height: 20,
                                width: 20,
                                child: CircularProgressIndicator(
                                  valueColor: AlwaysStoppedAnimation<Color>(
                                    Colors.white,
                                  ),
                                ),
                              )
                            : const Text(
                                'Proceed to Payment',
                                style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                  color: Colors.white,
                                ),
                              ),
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  Widget _buildPackCard(CreditPack pack) {
    final isSelected = _selectedPackId == pack.id;

    return GestureDetector(
      onTap: () => setState(() => _selectedPackId = pack.id),
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(
            color: isSelected ? const Color(0xFF6366F1) : Colors.grey[200]!,
            width: isSelected ? 2 : 1,
          ),
          borderRadius: BorderRadius.circular(12),
        ),
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            // Selection indicator
            Container(
              width: 24,
              height: 24,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  color: isSelected
                      ? const Color(0xFF6366F1)
                      : Colors.grey[300]!,
                  width: 2,
                ),
              ),
              child: isSelected
                  ? const Center(
                      child: Container(
                        width: 12,
                        height: 12,
                        decoration: BoxDecoration(
                          color: Color(0xFF6366F1),
                          shape: BoxShape.circle,
                        ),
                      ),
                    )
                  : null,
            ),
            const SizedBox(width: 16),

            // Pack details
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(
                        pack.name,
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                        ),
                      ),
                      const SizedBox(width: 8),
                      if (pack.isPopular)
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: const Color(0xFF6366F1),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: const Text(
                            'Popular',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 10,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                      if (pack.isBestValue)
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.amber,
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: const Text(
                            'Best Value',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 10,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '${pack.credits.toStringAsFixed(0)} Credits',
                    style: TextStyle(
                      color: Colors.grey[600],
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),

            // Price
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  '₹${pack.totalAmount.toStringAsFixed(2)}',
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                  ),
                ),
                Text(
                  'inc. ₹${pack.gstAmount.toStringAsFixed(2)} GST',
                  style: TextStyle(
                    color: Colors.grey[600],
                    fontSize: 10,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _proceedToPayment(
    BuildContext context,
    WalletService walletService,
  ) async {
    setState(() => _isProcessing = true);

    try {
      final selectedPack = walletService.packs
          .firstWhere((p) => p.id == _selectedPackId);

      final order = await walletService.createPaymentOrder(
        packId: _selectedPackId,
      );

      if (order != null && mounted) {
        Navigator.pop(context);
        if (mounted) {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => RazorpayPaymentScreen(
                order: order,
                pack: selectedPack,
              ),
            ),
          );
        }
      }
    } finally {
      if (mounted) {
        setState(() => _isProcessing = false);
      }
    }
  }
}

// Placeholder for Transaction History Screen
class TransactionHistoryScreen extends StatelessWidget {
  const TransactionHistoryScreen({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Transaction History'),
        backgroundColor: const Color(0xFF6366F1),
      ),
      body: const Center(
        child: Text('Transaction History Implementation'),
      ),
    );
  }
}

// Placeholder for Razorpay Payment Screen
class RazorpayPaymentScreen extends StatelessWidget {
  final Map<String, dynamic> order;
  final CreditPack pack;

  const RazorpayPaymentScreen({
    Key? key,
    required this.order,
    required this.pack,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Secure Payment'),
        backgroundColor: const Color(0xFF6366F1),
      ),
      body: const Center(
        child: Text('Razorpay Payment Implementation'),
      ),
    );
  }
}

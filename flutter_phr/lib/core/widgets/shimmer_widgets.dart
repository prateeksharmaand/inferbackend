import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';
import '../theme/app_theme.dart';

// ---------------------------------------------------------------------------
// Base wrapper — apply once per screen section, not per child widget
// ---------------------------------------------------------------------------

class PHRShimmer extends StatelessWidget {
  final Widget child;
  const PHRShimmer({super.key, required this.child});

  @override
  Widget build(BuildContext context) => Shimmer.fromColors(
    baseColor: const Color(0xFFE4E0FF),
    highlightColor: const Color(0xFFF5F4FF),
    child: child,
  );
}

// ---------------------------------------------------------------------------
// Primitive
// ---------------------------------------------------------------------------

class ShimmerBox extends StatelessWidget {
  final double width;
  final double height;
  final double radius;
  final EdgeInsetsGeometry? margin;

  const ShimmerBox({
    super.key,
    required this.width,
    required this.height,
    this.radius = 8,
    this.margin,
  });

  const ShimmerBox.circle({
    super.key,
    required double size,
    this.margin,
  })  : width = size,
        height = size,
        radius = size / 2;

  @override
  Widget build(BuildContext context) => Container(
    width: width,
    height: height,
    margin: margin,
    decoration: BoxDecoration(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(radius),
    ),
  );
}

// ---------------------------------------------------------------------------
// Dashboard — sleep card
// ---------------------------------------------------------------------------

class ShimmerSleepCard extends StatelessWidget {
  const ShimmerSleepCard({super.key});

  @override
  Widget build(BuildContext context) => PHRShimmer(
    child: Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const ShimmerBox(width: 110, height: 11, radius: 6),
        const SizedBox(height: 14),
        Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
          const ShimmerBox(width: 80, height: 40, radius: 8),
          const SizedBox(width: 8),
          const ShimmerBox(width: 50, height: 28, radius: 8),
          const Spacer(),
          // mini chart bars
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: List.generate(10, (i) => ShimmerBox(
              width: 6, height: 20 + (i % 3) * 12.0, radius: 3,
              margin: const EdgeInsets.symmetric(horizontal: 2),
            )),
          ),
        ]),
        const SizedBox(height: 12),
        const ShimmerBox(width: 130, height: 11, radius: 6),
      ]),
    ),
  );
}

// ---------------------------------------------------------------------------
// Dashboard — metric card (heart rate / calories)
// ---------------------------------------------------------------------------

class ShimmerMetricCard extends StatelessWidget {
  const ShimmerMetricCard({super.key});

  @override
  Widget build(BuildContext context) => PHRShimmer(
    child: Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          const ShimmerBox(width: 70, height: 10, radius: 5),
          const ShimmerBox(width: 44, height: 18, radius: 9),
        ]),
        const SizedBox(height: 14),
        Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
          const ShimmerBox(width: 56, height: 28, radius: 6),
          const SizedBox(width: 6),
          const ShimmerBox(width: 30, height: 14, radius: 4),
          const Spacer(),
          const ShimmerBox(width: 24, height: 24, radius: 12),
        ]),
      ]),
    ),
  );
}

// ---------------------------------------------------------------------------
// Dashboard — activity list item
// ---------------------------------------------------------------------------

class ShimmerActivityItem extends StatelessWidget {
  const ShimmerActivityItem({super.key});

  @override
  Widget build(BuildContext context) => PHRShimmer(
    child: Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(children: [
        const ShimmerBox(width: 42, height: 42, radius: 12),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const ShimmerBox(width: double.infinity, height: 12, radius: 6),
          const SizedBox(height: 6),
          const ShimmerBox(width: 100, height: 10, radius: 5),
        ])),
        const SizedBox(width: 12),
        const ShimmerBox(width: 52, height: 22, radius: 11),
      ]),
    ),
  );
}

// ---------------------------------------------------------------------------
// Vitals — latest vital card
// ---------------------------------------------------------------------------

class ShimmerVitalCard extends StatelessWidget {
  const ShimmerVitalCard({super.key});

  @override
  Widget build(BuildContext context) => PHRShimmer(
    child: Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(children: [
        const ShimmerBox(width: 60, height: 60, radius: 16),
        const SizedBox(width: 16),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const ShimmerBox(width: 100, height: 11, radius: 5),
          const SizedBox(height: 8),
          const ShimmerBox(width: 80, height: 28, radius: 6),
          const SizedBox(height: 6),
          const ShimmerBox(width: 50, height: 18, radius: 9),
        ])),
        const SizedBox(width: 12),
        Column(children: [
          const ShimmerBox(width: 30, height: 11, radius: 5),
          const SizedBox(height: 4),
          const ShimmerBox(width: 30, height: 11, radius: 5),
        ]),
      ]),
    ),
  );
}

// ---------------------------------------------------------------------------
// Vitals — trend chart placeholder
// ---------------------------------------------------------------------------

class ShimmerTrendChart extends StatelessWidget {
  const ShimmerTrendChart({super.key});

  @override
  Widget build(BuildContext context) => PHRShimmer(
    child: Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const ShimmerBox(width: 90, height: 14, radius: 6),
        const SizedBox(height: 12),
        const ShimmerBox(width: double.infinity, height: 140, radius: 12),
      ]),
    ),
  );
}

// ---------------------------------------------------------------------------
// Vitals — history tile
// ---------------------------------------------------------------------------

class ShimmerHistoryTile extends StatelessWidget {
  const ShimmerHistoryTile({super.key});

  @override
  Widget build(BuildContext context) => PHRShimmer(
    child: Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(children: [
        const ShimmerBox(width: 8, height: 40, radius: 4),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const ShimmerBox(width: 90, height: 13, radius: 5),
          const SizedBox(height: 6),
          const ShimmerBox(width: 140, height: 10, radius: 5),
        ])),
        const ShimmerBox(width: 52, height: 22, radius: 11),
      ]),
    ),
  );
}

// ---------------------------------------------------------------------------
// Documents — document tile
// ---------------------------------------------------------------------------

class ShimmerDocumentTile extends StatelessWidget {
  const ShimmerDocumentTile({super.key});

  @override
  Widget build(BuildContext context) => PHRShimmer(
    child: Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(children: [
        const ShimmerBox(width: 50, height: 50, radius: 12),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const ShimmerBox(width: double.infinity, height: 13, radius: 6),
          const SizedBox(height: 6),
          const ShimmerBox(width: 80, height: 10, radius: 5),
          const SizedBox(height: 4),
          const ShimmerBox(width: 120, height: 10, radius: 5),
          const SizedBox(height: 6),
          const ShimmerBox(width: 60, height: 10, radius: 5),
        ])),
        const SizedBox(width: 12),
        Column(children: [
          const ShimmerBox(width: 28, height: 10, radius: 5),
          const SizedBox(height: 4),
          const ShimmerBox(width: 28, height: 10, radius: 5),
          const SizedBox(height: 6),
          const ShimmerBox(width: 18, height: 18, radius: 9),
        ]),
      ]),
    ),
  );
}

// ---------------------------------------------------------------------------
// Documents — grid tile (2-column layout)
// ---------------------------------------------------------------------------

class ShimmerDocumentGridTile extends StatelessWidget {
  const ShimmerDocumentGridTile({super.key});

  @override
  Widget build(BuildContext context) => PHRShimmer(
    child: Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            height: 100,
            decoration: const BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
            ),
          ),
          const Padding(
            padding: EdgeInsets.fromLTRB(10, 8, 10, 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ShimmerBox(width: 60, height: 10, radius: 5),
                SizedBox(height: 6),
                ShimmerBox(width: double.infinity, height: 12, radius: 6),
                SizedBox(height: 4),
                ShimmerBox(width: 80, height: 10, radius: 5),
                SizedBox(height: 8),
                ShimmerBox(width: 50, height: 10, radius: 5),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// Timeline — timeline tile
// ---------------------------------------------------------------------------

class ShimmerTimelineTile extends StatelessWidget {
  final bool isLast;
  const ShimmerTimelineTile({super.key, this.isLast = false});

  @override
  Widget build(BuildContext context) => PHRShimmer(
    child: IntrinsicHeight(
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Column(children: [
          const ShimmerBox(width: 40, height: 40, radius: 20),
          if (!isLast)
            Expanded(child: Container(
              width: 2, margin: const EdgeInsets.symmetric(vertical: 4),
              color: AppColors.surface,
            )),
        ]),
        const SizedBox(width: 12),
        Expanded(child: Padding(
          padding: const EdgeInsets.only(bottom: 20),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                const ShimmerBox(width: 130, height: 13, radius: 6),
                const ShimmerBox(width: 36, height: 10, radius: 5),
              ]),
              const SizedBox(height: 8),
              const ShimmerBox(width: double.infinity, height: 10, radius: 5),
              const SizedBox(height: 4),
              const ShimmerBox(width: 160, height: 10, radius: 5),
            ]),
          ),
        )),
      ]),
    ),
  );
}

// ---------------------------------------------------------------------------
// Dashboard — AI banner
// ---------------------------------------------------------------------------

class ShimmerAiBanner extends StatelessWidget {
  const ShimmerAiBanner({super.key});

  @override
  Widget build(BuildContext context) => PHRShimmer(
    child: Container(
      height: 68,
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
      child: Row(children: [
        const ShimmerBox(width: 40, height: 40, radius: 12),
        const SizedBox(width: 14),
        const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          ShimmerBox(width: 160, height: 12, radius: 6),
          SizedBox(height: 6),
          ShimmerBox(width: 120, height: 10, radius: 5),
        ])),
        const ShimmerBox(width: 14, height: 14, radius: 7),
      ]),
    ),
  );
}

// ---------------------------------------------------------------------------
// Dashboard — heart health card
// ---------------------------------------------------------------------------

class ShimmerHeartHealthCard extends StatelessWidget {
  const ShimmerHeartHealthCard({super.key});

  @override
  Widget build(BuildContext context) => PHRShimmer(
    child: Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(children: [
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const ShimmerBox(width: 160, height: 14, radius: 6),
          const SizedBox(height: 8),
          const ShimmerBox(width: 200, height: 10, radius: 5),
          const SizedBox(height: 16),
          const ShimmerBox(width: 110, height: 30, radius: 15),
        ])),
        const SizedBox(width: 16),
        const ShimmerBox(width: 72, height: 72, radius: 36),
      ]),
    ),
  );
}

// ---------------------------------------------------------------------------
// Dashboard — sync card (health connect / gmail)
// ---------------------------------------------------------------------------

class ShimmerSyncCard extends StatelessWidget {
  const ShimmerSyncCard({super.key});

  @override
  Widget build(BuildContext context) => PHRShimmer(
    child: Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(children: [
        const ShimmerBox(width: 48, height: 48, radius: 14),
        const SizedBox(width: 14),
        const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          ShimmerBox(width: 120, height: 13, radius: 6),
          SizedBox(height: 6),
          ShimmerBox(width: 200, height: 10, radius: 5),
        ])),
        const ShimmerBox(width: 60, height: 30, radius: 15),
      ]),
    ),
  );
}

// ---------------------------------------------------------------------------
// Dashboard — quick actions grid
// ---------------------------------------------------------------------------

class ShimmerQuickActions extends StatelessWidget {
  const ShimmerQuickActions({super.key});

  @override
  Widget build(BuildContext context) => PHRShimmer(
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const ShimmerBox(width: 100, height: 10, radius: 5),
      const SizedBox(height: 12),
      GridView.count(
        crossAxisCount: 2,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
        childAspectRatio: 2.4,
        children: List.generate(4, (_) => Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(16),
          ),
          child: Row(children: [
            const ShimmerBox(width: 36, height: 36, radius: 10),
            const SizedBox(width: 10),
            const Expanded(child: ShimmerBox(width: double.infinity, height: 12, radius: 6)),
          ]),
        )),
      ),
    ]),
  );
}

// ---------------------------------------------------------------------------
// Dashboard — risk prediction card
// ---------------------------------------------------------------------------

class ShimmerRiskCard extends StatelessWidget {
  const ShimmerRiskCard({super.key});

  @override
  Widget build(BuildContext context) => PHRShimmer(
    child: Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const ShimmerBox(width: 48, height: 48, radius: 24),
          const SizedBox(width: 14),
          const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            ShimmerBox(width: 100, height: 13, radius: 6),
            SizedBox(height: 6),
            ShimmerBox(width: 60, height: 10, radius: 5),
          ])),
          const ShimmerBox(width: 64, height: 64, radius: 32),
        ]),
        const SizedBox(height: 14),
        const ShimmerBox(width: double.infinity, height: 8, radius: 4),
        const SizedBox(height: 12),
        const ShimmerBox(width: 200, height: 10, radius: 5),
        const SizedBox(height: 6),
        const ShimmerBox(width: 160, height: 10, radius: 5),
      ]),
    ),
  );
}

// ---------------------------------------------------------------------------
// Dashboard — recent activity / timeline card
// ---------------------------------------------------------------------------

class ShimmerTimelineCard extends StatelessWidget {
  const ShimmerTimelineCard({super.key});

  @override
  Widget build(BuildContext context) => PHRShimmer(
    child: Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(20)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: const [
          ShimmerBox(width: 32, height: 32, radius: 8),
          SizedBox(width: 10),
          ShimmerBox(width: 120, height: 13, radius: 6),
          Spacer(),
          ShimmerBox(width: 60, height: 11, radius: 5),
        ]),
        const SizedBox(height: 16),
        for (int i = 0; i < 4; i++) ...[
          Row(children: const [
            ShimmerBox(width: 32, height: 32, radius: 16),
            SizedBox(width: 10),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              ShimmerBox(width: double.infinity, height: 12, radius: 5),
              SizedBox(height: 4),
              ShimmerBox(width: 100, height: 10, radius: 5),
            ])),
            SizedBox(width: 8),
            ShimmerBox(width: 28, height: 10, radius: 5),
          ]),
          const SizedBox(height: 12),
        ],
      ]),
    ),
  );
}

// ---------------------------------------------------------------------------
// Convenience — renders N shimmer items in a column
// ---------------------------------------------------------------------------

class ShimmerList extends StatelessWidget {
  final int count;
  final Widget Function(int index, bool isLast) builder;
  final EdgeInsetsGeometry padding;

  const ShimmerList({
    super.key,
    required this.count,
    required this.builder,
    this.padding = const EdgeInsets.all(16),
  });

  @override
  Widget build(BuildContext context) => ListView.builder(
    padding: padding,
    itemCount: count,
    physics: const NeverScrollableScrollPhysics(),
    shrinkWrap: true,
    itemBuilder: (_, i) => builder(i, i == count - 1),
  );
}

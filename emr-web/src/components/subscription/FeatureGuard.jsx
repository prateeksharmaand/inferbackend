import { useSubscription } from '../context/SubscriptionContext';

export function FeatureGuard({ featureKey, children, fallback = null }) {
  const { hasFeature, isActive } = useSubscription();

  if (!isActive() || !hasFeature(featureKey)) {
    return fallback;
  }

  return children;
}

export function RequiredSeat({ requiredSeatType, children, fallback = null }) {
  const { hasSeatType, isActive } = useSubscription();

  if (!isActive() || !hasSeatType(requiredSeatType)) {
    return fallback;
  }

  return children;
}

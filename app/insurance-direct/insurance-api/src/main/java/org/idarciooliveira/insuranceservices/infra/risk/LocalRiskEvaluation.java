package org.idarciooliveira.insuranceservices.infra.risk;

import io.opentelemetry.instrumentation.annotations.WithSpan;
import org.idarciooliveira.insuranceservices.domain.usecase.RiskEvaluation;
import org.idarciooliveira.insuranceservices.infra.metrics.RiskMetrics;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

/**
 * In-process risk evaluation (single-service viva-seguro base).
 * Business rules ported from the former risk-service: high-value and
 * coverage-exhaustion rejections, plus env-driven fault injection
 * (CHAOS_LATENCY_MS / CHAOS_REJECT_RATE) for observability demos.
 */
@Component
public class LocalRiskEvaluation implements RiskEvaluation {

    private static final Logger log = LoggerFactory.getLogger(LocalRiskEvaluation.class);
    private static final BigDecimal HIGH_VALUE_THRESHOLD = new BigDecimal("50000");
    private static final BigDecimal COVERAGE_EXHAUSTION_RATIO = new BigDecimal("0.80");

    private final RiskMetrics metrics;
    private final long chaosLatencyMs;
    private final double chaosRejectRate;

    public LocalRiskEvaluation(
            RiskMetrics metrics,
            @Value("${CHAOS_LATENCY_MS:0}") long chaosLatencyMs,
            @Value("${CHAOS_REJECT_RATE:0}") double chaosRejectRate) {
        this.metrics = metrics;
        this.chaosLatencyMs = Math.max(0, chaosLatencyMs);
        this.chaosRejectRate = normalizeRejectRate(chaosRejectRate);
        if (chaosLatencyMs > 0 || this.chaosRejectRate > 0) {
            log.warn("chaos enabled latency_ms={} reject_rate={}", chaosLatencyMs, this.chaosRejectRate);
        }
    }

    /**
     * Accepts a 0.0-1.0 fraction. Values above 1 (e.g. {@code 10} meaning
     * "10%") are interpreted as a percentage to avoid a 100%-reject footgun:
     * {@code 10 -> 0.10}. Values are clamped to [0, 1].
     */
    static double normalizeRejectRate(double raw) {
        double rate = raw;
        if (rate > 1) {
            rate = rate / 100.0;
        }
        if (rate < 0) {
            return 0;
        }
        return Math.min(rate, 1.0);
    }

    @WithSpan("risk.check")
    @Override
    public boolean isApproved(UUID policyId, BigDecimal amount, BigDecimal coverageLimit) {
        long start = System.nanoTime();
        try {
            if (chaosLatencyMs > 0) {
                sleepUninterruptibly(chaosLatencyMs);
            }

            if (chaosRejectRate > 0 && ThreadLocalRandom.current().nextDouble() < chaosRejectRate) {
                log.warn("risk.check status=rejected policy={} amount={} reason=chaos_forced",
                        policyId, amount);
                metrics.countRiskRejected();
                return false;
            }

            if (amount.compareTo(HIGH_VALUE_THRESHOLD) > 0) {
                log.warn("risk.check status=rejected policy={} amount={} reason=high_value", policyId, amount);
                metrics.countRiskRejected();
                return false;
            }
            if (amount.compareTo(coverageLimit.multiply(COVERAGE_EXHAUSTION_RATIO)) > 0) {
                log.warn("risk.check status=rejected policy={} amount={} reason=coverage_exhaustion", policyId, amount);
                metrics.countRiskRejected();
                return false;
            }
            log.info("risk.check status=approved policy={} amount={}", policyId, amount);
            return true;
        } finally {
            metrics.recordRiskDuration(System.nanoTime() - start);
        }
    }

    private void sleepUninterruptibly(long millis) {
        long deadline = System.currentTimeMillis() + millis;
        long remaining;
        while ((remaining = deadline - System.currentTimeMillis()) > 0) {
            try {
                Thread.sleep(remaining);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
        }
    }
}

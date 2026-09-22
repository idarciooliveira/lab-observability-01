package org.idarciooliveira.insuranceservices.infra.config;

import com.zaxxer.hikari.HikariDataSource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.sql.DataSource;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;

/**
 * Builds the {@link DataSource} from a single {@code DATABASE_URL} variable, e.g.
 * {@code postgresql://insurance_user:secret@postgres:5432/insurance_db}.
 *
 * <p>Accepted schemes: {@code postgres://}, {@code postgresql://} (parsed into a JDBC
 * URL plus credentials) and {@code jdbc:postgresql://} (used as-is; credentials may ride
 * as {@code ?user=} / {@code ?password=} query params).
 *
 * <p>Percent-encode special characters in the password (e.g. {@code @} as {@code %40}).
 */
@Configuration
public class DatabaseConfig {

    @Bean
    public DataSource dataSource(
            @Value("${DATABASE_URL:postgresql://insurance_user:insurance_pass@localhost:5433/insurance_db}") String databaseUrl) {
        return createDataSource(databaseUrl.strip());
    }

    static HikariDataSource createDataSource(String databaseUrl) {
        if (databaseUrl.startsWith("jdbc:")) {
            HikariDataSource ds = new HikariDataSource();
            ds.setJdbcUrl(databaseUrl);
            return ds;
        }
        URI uri;
        try {
            uri = URI.create(databaseUrl);
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("Invalid DATABASE_URL: " + databaseUrl, e);
        }
        String scheme = uri.getScheme();
        if (scheme == null || (!scheme.equals("postgres") && !scheme.equals("postgresql"))) {
            throw new IllegalStateException(
                    "Invalid DATABASE_URL scheme, expected postgres:// or postgresql://: " + databaseUrl);
        }
        String userInfo = uri.getUserInfo();
        if (userInfo == null || !userInfo.contains(":")) {
            throw new IllegalStateException("Invalid DATABASE_URL, expected user:password userinfo: " + databaseUrl);
        }
        int separator = userInfo.indexOf(':');
        String username = decode(userInfo.substring(0, separator));
        String password = decode(userInfo.substring(separator + 1));
        String host = uri.getHost();
        if (host == null || host.isBlank()) {
            throw new IllegalStateException("Invalid DATABASE_URL, missing host: " + databaseUrl);
        }
        int port = uri.getPort() == -1 ? 5432 : uri.getPort();
        String path = uri.getPath();
        if (path == null || path.isBlank() || path.equals("/")) {
            throw new IllegalStateException("Invalid DATABASE_URL, missing database name: " + databaseUrl);
        }
        String jdbcUrl = "jdbc:postgresql://" + host + ":" + port + path
                + (uri.getQuery() != null ? "?" + uri.getQuery() : "");

        HikariDataSource ds = new HikariDataSource();
        ds.setJdbcUrl(jdbcUrl);
        ds.setUsername(username);
        ds.setPassword(password);
        return ds;
    }

    private static String decode(String value) {
        return URLDecoder.decode(value, StandardCharsets.UTF_8);
    }
}

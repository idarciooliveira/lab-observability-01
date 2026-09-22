package org.idarciooliveira.insuranceservices.infra.http;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Allows the local Vite dev server (and the dockerized web UI) to call the
 * API without authentication. Origins are configurable via CORS_ALLOWED_ORIGINS.
 */
@Configuration
public class CorsConfig {

    @Bean
    WebMvcConfigurer corsConfigurer(
            @Value("${CORS_ALLOWED_ORIGINS:http://localhost:5173,http://localhost:80,http://localhost:8080}") String[] allowedOrigins) {
        return new WebMvcConfigurer() {
            @Override
            public void addCorsMappings(CorsRegistry registry) {
                registry.addMapping("/**")
                        .allowedOrigins(allowedOrigins)
                        .allowedMethods("GET", "POST", "OPTIONS")
                        .allowedHeaders("*");
            }
        };
    }
}

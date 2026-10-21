namespace AITeacher.Api.Infrastructure;

/// <summary>PostgreSQL timestamps store microseconds, while DateTimeOffset stores 100 ns ticks.</summary>
internal static class PostgresTimestamp
{
    public static DateTimeOffset Normalize(DateTimeOffset value) =>
        new(value.Ticks - value.Ticks % 10, value.Offset);
}

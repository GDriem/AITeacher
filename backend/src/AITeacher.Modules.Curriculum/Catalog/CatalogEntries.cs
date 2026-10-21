namespace AITeacher.Modules.Curriculum.Catalog;

public interface ICatalogEntry
{
    Guid Id { get; set; }
    string Name { get; set; }
    string Slug { get; set; }
    int SortOrder { get; set; }
    bool IsAvailable { get; set; }
    long Version { get; set; }
}

public sealed class Subject : ICatalogEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = "";
    public string Slug { get; set; } = "";
    public int SortOrder { get; set; }
    public bool IsAvailable { get; set; } = true;
    public long Version { get; set; } = 1;
}

public sealed class Category : ICatalogEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = "";
    public string Slug { get; set; } = "";
    public int SortOrder { get; set; }
    public bool IsAvailable { get; set; } = true;
    public long Version { get; set; } = 1;
    public Guid SubjectId { get; set; }
}

public sealed class LevelScale : ICatalogEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = "";
    public string Slug { get; set; } = "";
    public int SortOrder { get; set; }
    public bool IsAvailable { get; set; } = true;
    public long Version { get; set; } = 1;
    public string Purpose { get; set; } = "difficulty";
}

public sealed class Level : ICatalogEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = "";
    public string Slug { get; set; } = "";
    public int SortOrder { get; set; }
    public bool IsAvailable { get; set; } = true;
    public long Version { get; set; } = 1;
    public Guid ScaleId { get; set; }
}

public sealed class Topic : ICatalogEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = "";
    public string Slug { get; set; } = "";
    public int SortOrder { get; set; }
    public bool IsAvailable { get; set; } = true;
    public long Version { get; set; } = 1;
    public Guid SubjectId { get; set; }
    public Guid CategoryId { get; set; }
    public Guid? LevelId { get; set; }
}
